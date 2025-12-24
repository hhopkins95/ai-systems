# Claude SDK Parser Parity Investigation

## Status: ✅ RESOLVED

## Problem Statement

The Claude SDK has two paths for building conversation state:
1. **Streaming** - Processing `raw-sdk-messages.jsonl` (real-time events)
2. **Transcript** - Loading saved `main-transcript.jsonl` / `combined-transcript.json`

These two paths were producing different output, causing inconsistencies when loading saved sessions vs. viewing live sessions.

## Root Cause (Confirmed)

The streaming path was broken because:

1. **`message_start` was ignored** - This event contains the message ID (`msg_0181BxGX...`) but we weren't capturing it
2. **`content_block_start` has no ID** - Only has `index: 0`, so we generated random UUIDs
3. **`content_block_delta` couldn't find blocks** - Delta events have `index` but we were emitting `blockId: ''` since we had no ID mapping
4. **Final `assistant` message created duplicates** - Used different IDs than streaming, creating duplicate blocks

## Solution Implemented

Created a **stateful event converter factory** (matching OpenCode's pattern):

### Key Changes

1. **New factory function**: `createClaudeSdkEventConverter(initialState?, options?)`
   - Returns `{ parseEvent, reset }` interface
   - Captures state in closure (not a class)

2. **Message ID tracking**:
   - `message_start` → capture `state.currentMessageId`
   - `content_block_start` → generate deterministic ID: `${messageId}-${index}`
   - Store `index → blockId` mapping in `state.blockIdsByIndex`

3. **Delta routing**:
   - `content_block_delta` → look up `blockId` by `index` from state
   - Emit `block:delta` with correct `blockId`

4. **Unified code paths**:
   - Both streaming and transcript now use the factory
   - `targetConversationId` parameter for subagent transcript routing

### Files Modified

- `packages/converters/src/claude-sdk/block-converter.ts`
  - Added `ClaudeSdkEventConverter` interface
  - Added `createClaudeSdkEventConverter()` factory
  - Added `ClaudeConverterState` with `currentMessageId`, `blockIdsByIndex`, `seenBlockIds`, `taskPrompts`

- `packages/converters/src/claude-sdk/transcript-parser.ts`
  - Updated `parseCombinedClaudeTranscript` to use factory
  - Pass `targetConversationId` for subagent messages

- `packages/converters/src/claude-sdk/index.ts`
  - Export new factory and interface

- `packages/converters/src/claude-sdk/test/transcript-parser.test.ts`
  - Updated streaming path to use factory

## Test Results

All 7 tests now pass:
- ✅ streaming produces blocks
- ✅ transcript produces blocks
- ✅ streaming and transcript produce same main block count
- ✅ streaming and transcript produce same subagent count
- ✅ main blocks have matching types
- ✅ subagent has tool_use and tool_result blocks in both sources
- ✅ text block content matches

## Architecture Notes

The stateful converter pattern (closure-based factory):
```typescript
export function createClaudeSdkEventConverter(
  initialConversationState?: {...},
  options?: ConvertOptions
): ClaudeSdkEventConverter {
  // State captured in closure
  const state = {
    currentMessageId: null,
    blockIdsByIndex: new Map(),
    seenBlockIds: new Set(),
    taskPrompts: new Map(),
  };

  function parseEvent(msg, targetConversationId?) { ... }
  function reset() { ... }

  return { parseEvent, reset };
}
```

This matches the OpenCode converter pattern, ensuring consistency across SDK implementations.
