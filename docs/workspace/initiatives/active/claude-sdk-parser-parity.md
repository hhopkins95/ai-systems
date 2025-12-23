# Claude SDK Parser Parity Investigation

## Problem Statement

The Claude SDK has two paths for building conversation state:
1. **Streaming** - Processing `raw-sdk-messages.jsonl` (real-time events)
2. **Transcript** - Loading saved `main-transcript.jsonl` / `combined-transcript.json`

These two paths produce different output, causing inconsistencies when loading saved sessions vs. viewing live sessions.

## Key Discrepancies Observed

### 1. Ghost Empty `assistant_text` Blocks (Streaming)
Empty `assistant_text` blocks with `status: "pending"` and `content: ""` appear in streamed state but not in transcript state.

### 2. Missing `SubagentBlock` (Transcript)
The transcript state was missing `subagent` type blocks - only had `tool_use` and `tool_result` for Task tools.

### 3. Task `tool_use`/`tool_result` Present Alongside SubagentBlock
Both states show both the SubagentBlock AND the underlying tool_use/tool_result. Question: is this intentional or redundant?

### 4. Subagent Conversation Blocks Differ
- Streaming subagent: 2 blocks (`tool_use`, `tool_result`)
- Transcript subagent: 4 blocks (`assistant_text`, `tool_use`, `tool_result`, `assistant_text`)

## Root Cause Analysis

### Data Format Differences
| Field | Streaming Format | Transcript Format |
|-------|------------------|-------------------|
| Parent ID | `parent_tool_use_id` | `parentUuid` (different field!) |
| Tool result | `tool_use_result` | `toolUseResult` |
| Case style | snake_case | camelCase |

### Why Empty Text Blocks?
Current hypothesis: **Delta events aren't being applied to blocks**

1. SDK's `content_block_start` for text blocks has NO ID - just `{type: "text", text: ""}`
2. We generate our own block IDs: `id: block.id || generateId()`
3. SDK's `content_block_delta` only has `index`, not block ID
4. Our delta events have `blockId: ''` (empty!) with comment "Will be set by caller based on index"
5. **No caller is setting the blockId** - so `handleBlockDelta` can't find the block

However, there may be additional issues causing this behavior that need investigation.

## Changes Made So Far

### 1. Fixed `toolUseResult` camelCase handling
`block-converter.ts` - `getTaskToolUseResult()` and `isTaskCompletion()` now check both `tool_use_result` and `toolUseResult`.

### 2. Emit `subagent:spawned` for Task tool_use in transcript mode
`block-converter.ts` - Added detection of Task tool_use in `sdkMessageToEvents()` to emit `subagent:spawned` event for transcripts (previously only done for streaming in `parseRawStreamEvent`).

### 3. Added empty block filtering in `handleSessionIdle`
`block-handlers.ts` - Added `isEmptyTextBlock()` helper and filtering logic when session becomes idle.

### 4. Added `finalizeState` helper to test
`transcript-parser.test.ts` - Test now emits `session:idle` events to trigger block finalization.

## Current Test Status
- 6 of 7 tests passing
- Remaining failure: subagent block types differ (streaming has 2, transcript has 4)
  - This is a **data source difference**, not a code bug - streaming raw events don't include subagent assistant text

## Open Questions

1. **Why are delta events not being routed to blocks?**
   - Current hypothesis: empty `blockId` in delta events
   - May be other factors

2. **Should we use SDK-provided IDs?**
   - Tool use blocks have IDs from SDK
   - Text blocks do NOT have IDs from SDK
   - Currently: `id: block.id || generateId()`

3. **Should SubagentBlock and tool_use coexist?**
   - Streaming creates both SubagentBlock AND tool_use block for Task tools
   - Is this intentional for transparency, or redundant?

4. **How should index-based delta routing work?**
   - SDK uses `index` to identify content blocks within a message
   - Options: stateful index→blockId tracking, or "latest pending block" heuristic

## Files Involved

- `packages/converters/src/claude-sdk/block-converter.ts` - Main event conversion
- `packages/converters/src/claude-sdk/transcript-parser.ts` - Transcript loading
- `packages/converters/src/session-state/handlers/block-handlers.ts` - Block state updates
- `packages/converters/src/session-state/handlers/subagent-handlers.ts` - Subagent lifecycle
- `packages/converters/src/claude-sdk/test/` - Test fixtures and tests

## Test Data
- `raw-sdk-messages.jsonl` - Streaming events (snake_case, has `parent_tool_use_id`)
- `main-transcript.jsonl` - Main conversation transcript (camelCase, has `parentUuid`)
- `subagent-transcript.jsonl` - Subagent conversation transcript
- `combined-transcript.json` - Wrapper format bundling main + subagents
