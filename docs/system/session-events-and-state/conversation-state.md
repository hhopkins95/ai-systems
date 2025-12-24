# Conversation State

How session events build conversation state through a shared, immutable reducer.

## Overview

The conversation state reducer transforms a stream of session events into structured conversation state. It's used by both server and client to ensure consistent state management.

```
┌─────────────────────────────────────────────────────────────────┐
│                      SESSION EVENTS                             │
│  block:upsert, block:delta, subagent:spawned, ...              │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                   CONVERSATION STATE REDUCER                    │
│                                                                 │
│   Pure function: (state, event) => newState                    │
│   Immutable: never mutates, always returns new state           │
│   Shared: same logic on server and client                      │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                  SESSION CONVERSATION STATE                     │
│                                                                 │
│   blocks: ConversationBlock[]     (main conversation)          │
│   subagents: SubagentState[]      (nested conversations)       │
└─────────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **Single source of truth** — Block content lives in the block itself, not in separate streaming state
2. **Immutable updates** — Reducer returns new state objects, never mutates
3. **Stateless handlers** — Each event handler is a pure function
4. **Defensive handling** — Gracefully handles out-of-order or missing events

## State Shape

```typescript
interface SessionConversationState {
  /** Conversation blocks in the main conversation */
  blocks: ConversationBlock[];

  /** Subagent conversations (nested threads) */
  subagents: SubagentState[];
}
```

### ConversationBlock

All blocks share a common structure with type-specific fields:

```typescript
interface ConversationBlock {
  id: string;                              // Unique identifier
  type: BlockType;                         // 'user_message' | 'assistant_text' | 'tool_use' | 'tool_result' | 'subagent' | ...
  timestamp: string;                       // ISO timestamp
  status: 'pending' | 'complete' | 'error'; // Lifecycle status
  conversationId: string;                  // Which conversation this belongs to
  // ... type-specific fields
}
```

**Status values:**
- `pending` — Block is being built (receiving deltas, waiting for result)
- `complete` — Block is finalized
- `error` — Something failed

### SubagentState

Represents a subagent's conversation thread:

```typescript
interface SubagentState {
  // Identifiers (lookup by either)
  toolUseId: string;       // From Task tool invocation (always available)
  agentId?: string;        // From SDK (available after completion)

  // The subagent's blocks
  blocks: ConversationBlock[];

  // Lifecycle
  status: 'pending' | 'running' | 'success' | 'error';
  prompt?: string;
  output?: string;
  durationMs?: number;
}
```

**Note:** Subagents are identified by `toolUseId` during streaming and optionally by `agentId` after completion. Lookup functions check both.

## Events

The reducer handles a minimal set of events:

| Event | Purpose |
|-------|---------|
| `block:upsert` | Create or replace a block |
| `block:delta` | Append content to a block |
| `subagent:spawned` | Create SubagentBlock + SubagentState |
| `subagent:completed` | Finalize subagent with result |
| `session:idle` | Finalize any pending blocks |

### Event Payloads

```typescript
type ConversationEvent =
  | {
      type: 'block:upsert';
      conversationId: string;  // 'main' or subagent's toolUseId
      block: ConversationBlock;
    }
  | {
      type: 'block:delta';
      conversationId: string;
      blockId: string;
      delta: string;
    }
  | {
      type: 'subagent:spawned';
      toolUseId: string;
      prompt: string;
      subagentType: string;
      description?: string;
    }
  | {
      type: 'subagent:completed';
      toolUseId: string;
      agentId?: string;
      status: 'completed' | 'error';
      output?: string;
      durationMs?: number;
    }
  | {
      type: 'session:idle';
      conversationId: string;
    };
```

## State Machine

### Block Lifecycle

```
                    block:upsert (status: pending)
                              │
                              ▼
                   ┌──────────────────┐
                   │  Block Created   │
                   │  status: pending │
                   │  content: ''     │
                   └────────┬─────────┘
                            │
           ┌────────────────┼────────────────┐
           │                │                │
           ▼                ▼                ▼
     block:delta      block:delta      block:delta
     content += δ₁    content += δ₂    content += δ₃
           │                │                │
           └────────────────┼────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
              ▼                           ▼
┌─────────────────────────┐    ┌─────────────────────────┐
│    block:upsert         │    │    session:idle         │
│    (status: complete)   │    │    (safety finalize)    │
└─────────────────────────┘    └─────────────────────────┘
              │                           │
              └─────────────┬─────────────┘
                            ▼
                   ┌──────────────────┐
                   │  Block Complete  │
                   │  status: complete│
                   └──────────────────┘
```

### Subagent Lifecycle

```
subagent:spawned
       │
       ├──► Create SubagentBlock in parent conversation
       │    { type: 'subagent', toolUseId, status: 'running' }
       │
       └──► Create SubagentState in subagents[]
            { toolUseId, blocks: [], status: 'running' }

       │
       ▼
┌──────────────────────────────────────────────────────┐
│  block:* events with conversationId = toolUseId     │
│  → Route to SubagentState.blocks[]                  │
└──────────────────────────────────────────────────────┘
       │
       ▼
subagent:completed
       │
       ├──► Update SubagentBlock: { status, output, agentId, durationMs }
       │
       └──► Update SubagentState: { status, output, agentId, durationMs }
```

### Nested Subagents

Subagents can spawn other subagents. The `conversationId` determines routing:

```
main conversation (conversationId: 'main')
  └── SubagentBlock { toolUseId: 'A' }

subagents[]:
  └── SubagentState { toolUseId: 'A' }
        └── blocks:
              └── SubagentBlock { toolUseId: 'B' }  ◄── spawned from A

  └── SubagentState { toolUseId: 'B' }              ◄── B's own thread
        └── blocks: [...]
```

When subagent A spawns subagent B:
- `subagent:spawned` has `conversationId: 'A'`
- SubagentBlock for B goes in A's blocks
- SubagentState for B goes in root `subagents[]`

## Handler Logic

### block:upsert

Creates or replaces a block. Uses replace semantics (full block, not merge).

```typescript
function handleBlockUpsert(state, event): State {
  const { conversationId, block } = event;

  if (conversationId === 'main') {
    return upsertMainBlock(state, block);
  } else {
    return upsertSubagentBlock(state, conversationId, block);
  }
}

function upsertMainBlock(state, block): State {
  const idx = state.blocks.findIndex(b => b.id === block.id);

  if (idx >= 0) {
    // Replace existing
    const newBlocks = [...state.blocks];
    newBlocks[idx] = block;
    return { ...state, blocks: newBlocks };
  } else {
    // Append new
    return { ...state, blocks: [...state.blocks, block] };
  }
}

function upsertSubagentBlock(state, conversationId, block): State {
  let subagent = findSubagent(state, conversationId);

  // Defensive: create subagent if missing
  if (!subagent) {
    subagent = { toolUseId: conversationId, blocks: [], status: 'running' };
    state = { ...state, subagents: [...state.subagents, subagent] };
  }

  // Upsert block into subagent's blocks
  // ... similar to upsertMainBlock
}
```

### block:delta

Appends content to an existing block. Only applies to blocks with text content.

```typescript
function handleBlockDelta(state, event): State {
  const { conversationId, blockId, delta } = event;

  if (!delta) return state;  // Skip empty deltas

  const block = findBlock(state, conversationId, blockId);
  if (!block || !('content' in block)) return state;  // Defensive

  return updateBlock(state, conversationId, blockId, {
    content: (block.content ?? '') + delta
  });
}
```

### subagent:spawned

Creates both the SubagentBlock (in parent conversation) and SubagentState (in subagents[]).

```typescript
function handleSubagentSpawned(state, event): State {
  const { toolUseId, prompt, subagentType, description } = event;
  const conversationId = event.context.conversationId ?? 'main';

  // Create block in parent conversation
  const subagentBlock: SubagentBlock = {
    type: 'subagent',
    timestamp: event.context.timestamp,
    toolUseId,
    name: subagentType,
    description,
    input: prompt,
    status: 'running',
  };

  // Create subagent state
  const subagentState: SubagentState = {
    toolUseId,
    blocks: [],
    status: 'running',
    prompt,
  };

  // Add block to parent conversation, add state to subagents[]
  let newState = upsertBlock(state, subagentBlock, conversationId);
  return { ...newState, subagents: [...newState.subagents, subagentState] };
}
```

### subagent:completed

Updates both the SubagentBlock and SubagentState with final result.

```typescript
function handleSubagentCompleted(state, event): State {
  const { toolUseId, agentId, status, output, durationMs } = event;
  const finalStatus = status === 'completed' ? 'success' : 'error';

  // Find and update SubagentBlock (could be in main or nested)
  // ... search all conversations for block with this toolUseId

  // Find and update SubagentState
  const subIdx = findSubagentIndex(state, toolUseId);
  if (subIdx >= 0) {
    const newSubagents = [...state.subagents];
    newSubagents[subIdx] = {
      ...newSubagents[subIdx],
      agentId,
      status: finalStatus,
      output,
      durationMs,
    };
    state = { ...state, subagents: newSubagents };
  }

  return state;
}
```

### session:idle

Finalizes any blocks still in pending status. Safety net for incomplete streams.

```typescript
function handleSessionIdle(state, conversationId): State {
  if (conversationId === 'main') {
    const newBlocks = state.blocks.map(b =>
      b.status === 'pending' ? { ...b, status: 'complete' } : b
    );
    return { ...state, blocks: newBlocks };
  } else {
    // Finalize blocks in subagent conversation
    const subIdx = findSubagentIndex(state, conversationId);
    if (subIdx < 0) return state;

    const subagent = state.subagents[subIdx];
    const newBlocks = subagent.blocks.map(b =>
      b.status === 'pending' ? { ...b, status: 'complete' } : b
    );

    const newSubagents = [...state.subagents];
    newSubagents[subIdx] = { ...subagent, blocks: newBlocks };
    return { ...state, subagents: newSubagents };
  }
}
```

## Edge Cases

### Handled Gracefully

| Scenario | Behavior |
|----------|----------|
| Delta before upsert | Ignored (block not found) |
| Block event before subagent:spawned | Defensive create subagent |
| Empty delta | Skipped |
| Delta for non-text block | Ignored (no content field) |
| Multiple pending blocks on idle | All finalized |

### Design Decisions

| Decision | Rationale |
|----------|-----------|
| No separate streaming state | Single source of truth; block.content is always current |
| Replace semantics for upsert | Simpler than merge; blocks aren't large |
| Status on block | Generic (`pending`/`complete`/`error`) applies to all block types |
| Lookup by toolUseId OR agentId | toolUseId available during streaming, agentId after completion |
| conversationId on block | Enables safe routing; avoids ID collisions across conversations |

### Potential Issues

| Issue | Mitigation |
|-------|------------|
| toolUseId/agentId collision | Check toolUseId first (primary key during streaming) |
| Completion before spawn | Defensive create subagent on completion |
| Linear scan performance | Acceptable for typical conversation sizes; add indexing if needed |

## Transcript Loading

Conversation state can be built from two sources:

### Streaming (Real-time)

During active queries, events arrive incrementally:

```
block:upsert (status: pending) → block:delta × N → block:upsert (status: complete)
```

The reducer accumulates deltas and finalizes blocks as events arrive.

### Transcript Loading (Persistence)

When restoring saved sessions, transcripts are parsed into events:

```
┌─────────────────────────────────────────────────────────────────┐
│                      TRANSCRIPT LOADING                         │
│                                                                 │
│   Disk (JSONL/JSON)                                             │
│         │                                                       │
│         ▼                                                       │
│   parseTranscript(architecture, rawTranscript)                  │
│         │                                                       │
│         ├── Claude SDK: parseCombinedClaudeTranscript()         │
│         │   • Parses JSONL lines into SDKMessage[]              │
│         │   • Converts each message to SessionEvent[]           │
│         │                                                       │
│         └── OpenCode: parseOpenCodeTranscriptFile()             │
│             • Parses JSON into OpenCodeSessionTranscript        │
│             • Extracts messages and parts to SessionEvent[]     │
│         │                                                       │
│         ▼                                                       │
│   SessionEvent[] (all block:upsert with status: complete)       │
│         │                                                       │
│         ▼                                                       │
│   reduceSessionEvent() × N  (same reducer as streaming)         │
│         │                                                       │
│         ▼                                                       │
│   SessionConversationState                                      │
└─────────────────────────────────────────────────────────────────┘
```

**Key difference:** Transcript loading emits `block:upsert` events with `status: complete` directly — no deltas, no pending state. Blocks are already finalized in the transcript.

### Parity Guarantee

Both paths use the **same reducer**, ensuring:

- Identical state structure from streaming or transcript
- Consistent block ordering and subagent handling
- Testable with event replay

```typescript
import { parseTranscript } from '@hhopkins/agent-converters';

// Load from transcript
const state = parseTranscript('claude-sdk', rawTranscriptString);

// Equivalent to streaming all events through reducer
let state = createInitialConversationState();
for (const event of transcriptEvents) {
  state = reduceSessionEvent(state, event);
}
```

## Usage

### Basic Usage

```typescript
import { reduceSessionEvent, createInitialConversationState } from '@hhopkins/agent-converters';

let state = createInitialConversationState();

for (const event of sessionEvents) {
  state = reduceSessionEvent(state, event);
}

// state.blocks contains the main conversation
// state.subagents contains nested conversations
```

### With React

```typescript
function useConversationState(sessionId: string) {
  const [state, dispatch] = useReducer(reduceSessionEvent, createInitialConversationState());

  useEffect(() => {
    socket.on('session:event', (event) => {
      if (isConversationEvent(event)) {
        dispatch(event);
      }
    });
  }, [sessionId]);

  return state;
}
```

## Where It Lives

| Concern | Location |
|---------|----------|
| State types | `packages/types/src/runtime/conversation-state.ts` |
| Block types | `packages/types/src/runtime/blocks.ts` |
| Reducer | `packages/converters/src/session-state/reducer.ts` |
| Handlers | `packages/converters/src/session-state/handlers/` |

## Related

- [Streaming and Events](./streaming-and-events.md) — Event flow architecture
- [Session Lifecycle](./session-lifecycle.md) — When events are emitted
- [agent-converters](../packages/agent-converters.md) — Package documentation
