---
title: Shared Session State Reducer
created: 2025-12-19
status: active
---

# Shared Session State Reducer

## Goal

Create a shared, immutable reducer for session conversation state that:
1. Handles subagent lifecycle correctly (spawned → streaming → completed)
2. Works for both server (SessionState) and client (React reducer)
3. Is architecture-agnostic (Claude SDK + OpenCode compatible)
4. Fixes the streaming vs transcript-loading discrepancy for subagents

## Background

Currently, subagents display correctly after restart (loading from transcript) but NOT during streaming. The root causes:
- Duplicated state logic between server and client
- Inconsistent ID handling (toolUseId vs agentId)
- SubagentBlock not created until Task completes (should appear immediately)

See: `docs/workspace/initiatives/active/subagent-streaming-fix.md` for detailed problem analysis.

## Scope

**In scope:**
- Update types in `packages/types/src/runtime/blocks.ts` (SubagentBlock with flexible IDs)
- Update types in `packages/types/src/runtime/session-events.ts` (subagent:spawned, subagent:completed)
- Create shared reducer in `packages/converters/src/session-state/reducer.ts`
- Update Claude SDK converter to emit new subagent events
- Integrate reducer into server SessionState
- Integrate reducer into client reducer

**Out of scope:**
- OpenCode converter implementation (types will be flexible for future support)
- UI component changes (state management only)
- Transcript parser changes (will work with existing format)

## Design Decisions

### 1. Flexible ID Approach

Both `subagentId` and `toolUseId` are optional on SubagentBlock. Either can identify the subagent:
- During streaming: `toolUseId` available first
- From transcript: `agentId` available from filename
- On completion: both available

```typescript
interface SubagentBlock {
  subagentId?: string;  // Could be agentId from transcript
  toolUseId?: string;   // Could be from streaming
  // At least one should be set
}
```

### 2. Immutable Reducer

Pure function that returns new state, never mutates:
```typescript
function reduceSessionEvent(
  state: SessionConversationState,
  event: AnySessionEvent
): SessionConversationState
```

### 3. SubagentBlock Lifecycle

Created when Task tool starts (status: running), updated on completion:
```
Task tool_use → subagent:spawned → SubagentBlock (running)
Subagent works → block:* events with conversationId → subagent.blocks updated
Task completes → subagent:completed → SubagentBlock (success/error)
```

### 4. Event-Driven Routing

Blocks routed by `event.context.conversationId`:
- `'main'` → state.blocks
- anything else → state.subagents[conversationId].blocks

## Completion Criteria

- [x] Types updated with flexible SubagentBlock and new subagent events
- [x] Shared reducer implemented and tested
- [x] Claude SDK converter emits subagent:spawned/completed events
- [x] Server SessionState uses shared reducer
- [x] Client reducer uses shared reducer
- [ ] Subagents display correctly during streaming (matches post-restart behavior)
- [ ] Documentation updated

## Implementation Plan

### Phase 1: Types
1. Update `SubagentBlock` with optional `subagentId` and `toolUseId`
2. Add `subagent:spawned` event type
3. Update `subagent:completed` event payload

### Phase 2: Reducer
1. Create `packages/converters/src/session-state/reducer.ts`
2. Implement `SessionConversationState` type
3. Implement `reduceSessionEvent` function
4. Handle all block and subagent events
5. Add unit tests

### Phase 3: Converter
1. Update `claude-sdk/block-converter.ts` to emit `subagent:spawned` when Task tool_use detected
2. Emit `subagent:completed` when Task tool_result arrives
3. Include both toolUseId and agentId where available

### Phase 4: Integration
1. Update `SessionState` to use shared reducer for conversation state
2. Update client reducer to use shared reducer
3. End-to-end testing

## Current Status

**Claude SDK tests set up, parity issues identified** (2025-12-19)

### Completed:
- [x] Types updated with flexible SubagentBlock and new subagent events
- [x] Shared reducer implemented in `packages/converters/src/session-state/`
- [x] Claude SDK converter emits `subagent:spawned` / `subagent:completed` events
- [x] Server SessionState uses shared reducer
- [x] Client reducer updated with new action handlers
- [x] **Type reorganization** - moved `SessionConversationState` etc. to shared-types
- [x] **RuntimeSessionData restructure** - now uses `conversationState` field
- [x] **Converter simplification** - single code path via `sdkMessageToEvents()`
- [x] **Removed `ParsedTranscript`** - all parsers return `SessionConversationState`
- [x] **Cleaned up transcript-parser** - removed unused `extractSubagentId`, `detectSubagentStatus`
- [x] **Set up Vitest** - added test infrastructure to converters package
- [x] **Created parity tests** - `src/test/claude/transcript-parser.test.ts`
- [x] All packages build successfully

### Parity Issues Identified (Claude SDK):
Tests in `packages/converters/src/test/claude/` compare streaming vs transcript loading:

| Issue | Streaming | Transcript |
|-------|-----------|------------|
| Extra text block | Has duplicate `assistant_text` | - |
| Subagent block | Creates `subagent` block on spawn | Missing |
| Block ordering | `tool_result, skill_load` | `skill_load, tool_result` |
| Subagent blocks | Missing `assistant_text` blocks | Has all blocks |

Output files written to `src/test/claude/output/` for inspection.

### Next Steps:
1. [ ] Analyze OpenCode implementation with same parity testing approach
2. [ ] Fix identified parity issues in Claude SDK converter
3. [ ] End-to-end streaming test

### Session Notes:
- [2025-12-19-implementation.md](sessions/2025-12-19-implementation.md) - Initial implementation
- [2025-12-19-type-reorganization.md](sessions/2025-12-19-type-reorganization.md) - Type cleanup & converter simplification
- [2025-12-19-parity-tests.md](sessions/2025-12-19-parity-tests.md) - Test setup & parity analysis

## Quick Links

- [Sessions](sessions/)
- [Related: Subagent Streaming Fix](../subagent-streaming-fix.md)
- [Types: blocks.ts](../../../../packages/types/src/runtime/blocks.ts)
- [Types: session-events.ts](../../../../packages/types/src/runtime/session-events.ts)
- [Server: session-state.ts](../../../../runtime/server/src/core/session/session-state.ts)
