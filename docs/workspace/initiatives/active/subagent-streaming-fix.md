# Subagent Streaming Fix - Debug Session

## Problem Statement

When Claude SDK streams responses that include subagents (Task tool), the UI doesn't properly display them during streaming:

1. **Subagent blocks go to wrong conversation**: Text blocks from subagents appear in the main conversation instead of their respective subagent conversations
2. **No Task tool block in main**: The main conversation doesn't show a Task tool block indicating a subagent was spawned
3. **Works after restart**: Reloading the transcript by restarting the server correctly reconstructs the subagent hierarchy

## Architecture Overview

### Event Flow
```
Claude SDK (query generator)
    ↓
executeClaudeQuery() [runtime/runner/src/core/execute-claude-query.ts]
    ↓
parseStreamEvent() [packages/converters/src/claude-sdk/block-converter.ts]
  - Extracts conversationId from parent_tool_use_id
  - Creates SessionEvents with conversationId context
    ↓
ExecutionEnvironment.executeQuery() [runtime/server/src/core/session/execution-environment.ts]
  - Parses JSONL from runner stdout
  - Enriches events with sessionId
  - Emits to SessionEventBus
    ↓
ClientBroadcastListener → ClientHub → WebSocket → Client
    ↓
AgentServiceProvider [runtime/client/src/context/AgentServiceProvider.tsx]
  - Dispatches reducer actions based on event type
    ↓
agentServiceReducer [runtime/client/src/context/reducer.ts]
  - Routes blocks to main or subagent based on conversationId
```

### Key Files
- `packages/converters/src/claude-sdk/block-converter.ts` - Converts SDK messages to SessionEvents
- `runtime/client/src/context/reducer.ts` - Client state management
- `runtime/client/src/context/AgentServiceProvider.tsx` - Event dispatch
- `runtime/client/src/hooks/useSubagents.ts` - Subagent data access

## What We've Discovered

### 1. `subagent:discovered` Event Works
The user confirmed that `subagent:discovered` events ARE being received by the client. This means:
- The Task tool detection in `parseRawStreamEvent()` works
- The event is broadcast correctly
- The client reducer creates the subagent entry

### 2. Tool Use Blocks Route Correctly (After First Fix)
After our first fix, tool_use blocks from subagents now appear in the correct subagent conversation.

### 3. Text Blocks Still Go to Main
Text blocks from subagents still appear in the main conversation, suggesting `parent_tool_use_id` extraction works differently for different event types.

### 4. No Task Tool Block in Main Conversation
The Task tool_use block that should appear in the main conversation (showing input/output of the subagent call) doesn't display.

## Changes Made

### Fix 1: Check Multiple Locations for parent_tool_use_id
File: `packages/converters/src/claude-sdk/block-converter.ts` (lines 175-177)

```typescript
// Before
const conversationId: 'main' | string =
  (event as any).parent_tool_use_id
    ? (event as any).parent_tool_use_id
    : 'main';

// After
const outerParentId = (event as any).parent_tool_use_id;
const innerParentId = event.type === 'stream_event' ? (event as any).event?.parent_tool_use_id : undefined;
const conversationId: 'main' | string = outerParentId || innerParentId || 'main';
```

### Fix 2: Added Debug Logging
File: `packages/converters/src/claude-sdk/block-converter.ts` (lines 179-193)

Added logging to capture SDK event structure during streaming to identify where `parent_tool_use_id` lives for different event types.

## Root Cause Found

### SDK Event Structure
After analyzing debug logs with full event dump, we discovered:

1. **`parent_tool_use_id` IS used correctly** - Set to the Task tool's `toolUseId` for all subagent events
2. **Subagent events are NOT `stream_event` types** - They appear as complete `assistant` and `user` message types (no incremental streaming)
3. **Agent ID only comes at the end** - In the `tool_use_result` when Task completes

### The Actual Bug: Server-Side SessionState

The bug was in `SessionState` class (session-state.ts):
- The `upsertBlock()` and `updateBlock()` methods ignored `conversationId` context
- All blocks went to `_blocks` (main conversation) regardless of which conversation they belonged to
- No listener for `subagent:discovered` event to initialize subagents

The **client-side** reducer was already correct - it properly routed blocks by `conversationId`.

## Fix Applied (Session 2024-12-19)

### Fix 3: SessionState Subagent Block Routing
File: `runtime/server/src/core/session/session-state.ts`

**Changes:**

1. Added `subagent:discovered` event listener to initialize subagents:
```typescript
eventBus.on('subagent:discovered', (event) => {
  const subagentId = event.payload.subagent.id;
  if (!this._subagents.find((s) => s.id === subagentId)) {
    this._subagents.push({
      id: subagentId,
      blocks: event.payload.subagent.blocks ?? [],
    });
  }
});
```

2. Modified block event handlers to pass `conversationId`:
```typescript
eventBus.on('block:start', (event) => {
  const conversationId = event.context?.conversationId ?? 'main';
  this.upsertBlock(event.payload.block, conversationId);
});
```

3. Updated `upsertBlock()` and `updateBlock()` to route blocks to correct conversation:
```typescript
private upsertBlock(block: ConversationBlock, conversationId: string): void {
  if (conversationId === 'main') {
    // Main conversation
    ...
  } else {
    // Subagent conversation
    let subagent = this._subagents.find((s) => s.id === conversationId);
    if (!subagent) {
      subagent = { id: conversationId, blocks: [] };
      this._subagents.push(subagent);
    }
    ...
  }
}
```

## Status

- [x] Identified root cause
- [x] Fixed server-side SessionState block routing
- [ ] Test fix with real subagent streaming
- [ ] Verify Task tool block appears in main conversation

## How to Test

1. Start the dev server with the converters package rebuilt
2. Create a session and send a prompt that triggers a Task tool (subagent)
3. Check:
   - Server logs for debug output
   - Client UI for subagent appearance
   - Main conversation for Task tool block
4. Compare with behavior after server restart (transcript reload)

## Build Command
```bash
pnpm --filter @hhopkins/agent-converters run build
```

## Related Documentation
- Plan file: `/Users/hunterhopkins/.claude/plans/graceful-dazzling-backus.md`
- Event types: `packages/types/src/runtime/session-events.ts`
- Streaming docs: `docs/system/streaming-and-events.md`
