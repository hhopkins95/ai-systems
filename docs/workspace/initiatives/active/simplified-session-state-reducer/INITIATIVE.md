---
title: Simplified Session State Reducer
created: 2025-12-20
status: active
---

# Simplified Session State Reducer

## Goal

Simplify the conversation state reducer by:
1. Replacing `block:start/complete/update` with unified `block:upsert` event
2. Removing separate `streaming.byConversation` state (content lives directly in blocks)
3. Using `pending/complete/error` status on blocks instead of separate streaming tracking
4. Updating SubagentState to use `toolUseId` + optional `agentId` (no confusing `id` field)

This reduces complexity, eliminates dual-state correlation, and makes the reducer easier to reason about.

## Scope

**In scope:**
- `packages/types/src/runtime/conversation-state.ts` - Remove StreamingState, update types
- `packages/types/src/runtime/blocks.ts` - Add status field to blocks
- `packages/types/src/runtime/session-events.ts` - Add `block:upsert`, update payloads
- `packages/converters/src/session-state/reducer.ts` - Simplify to handle new events
- `packages/converters/src/session-state/handlers/` - Update block/subagent handlers
- `packages/converters/src/opencode/block-converter.ts` - Emit new event types
- `packages/converters/src/claude-sdk/block-converter.ts` - Emit new event types
- Tests for all above

**Out of scope:**
- `runtime/server/src/core/session/session-state.ts` (SessionState class) - trivial follow-up
- Client-side reducer - trivial follow-up
- Transcript parsers - should work unchanged (they emit block:complete → block:upsert)

## Design Summary

### State Shape (Target)

```typescript
interface SessionConversationState {
  blocks: ConversationBlock[];
  subagents: SubagentState[];
  // No streaming state
}

interface ConversationBlock {
  id: string;
  type: BlockType;
  timestamp: string;
  status: 'pending' | 'complete' | 'error';
  conversationId: string;
  // ... type-specific fields
}

interface SubagentState {
  toolUseId: string;       // Primary key during streaming
  agentId?: string;        // Available after completion
  blocks: ConversationBlock[];
  status: 'pending' | 'running' | 'success' | 'error';
  prompt?: string;
  output?: string;
  durationMs?: number;
}
```

### Events (Target)

```typescript
type ConversationEvent =
  | { type: 'block:upsert'; conversationId: string; block: ConversationBlock }
  | { type: 'block:delta'; conversationId: string; blockId: string; delta: string }
  | { type: 'subagent:spawned'; toolUseId: string; prompt: string; subagentType: string }
  | { type: 'subagent:completed'; toolUseId: string; agentId?: string; status: string; output?: string }
  | { type: 'session:idle'; conversationId: string }
```

### Key Changes

| Current | Target |
|---------|--------|
| `block:start` + `block:complete` | `block:upsert` (status indicates lifecycle) |
| `block:update` | `block:upsert` (replace semantics) |
| `streaming.byConversation` Map | Block content updated directly |
| SubagentState.id | Removed (use toolUseId/agentId) |

## Completion Criteria

- [x] Types updated in `packages/types/`
- [x] Reducer simplified in `packages/converters/`
- [~] OpenCode converter emits new events (code done, build errors to fix)
- [ ] Claude SDK converter emits new events
- [ ] All existing tests pass or updated
- [ ] Build succeeds
- [ ] Documentation already done (see `docs/system/session-events-and-state/`)

## Current Status

**In Progress** - OpenCode converter updated, fixing build errors.

See `sessions/2025-12-20-session.md` for detailed session notes.

## Quick Links

- [Sessions](sessions/)
- [Design Doc](../../../system/session-events-and-state/conversation-state.md)
