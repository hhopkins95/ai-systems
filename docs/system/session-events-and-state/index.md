# Session Events and State

How agent interactions become structured conversation state.

## The Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AGENT ARCHITECTURES                               │
│                                                                             │
│   ┌─────────────────┐              ┌─────────────────┐                      │
│   │   Claude SDK    │              │    OpenCode     │                      │
│   │                 │              │                 │                      │
│   │ • JSONL events  │              │ • SSE events    │                      │
│   │ • content_block │              │ • message.part  │                      │
│   │ • tool_use      │              │ • session.idle  │                      │
│   └────────┬────────┘              └────────┬────────┘                      │
│            │                                │                               │
└────────────┼────────────────────────────────┼───────────────────────────────┘
             │                                │
             ▼                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CONVERTERS                                     │
│                                                                             │
│   sdkMessageToEvents()              createOpenCodeEventConverter()          │
│                                                                             │
│   • Claude: Pure functions          • OpenCode: Stateful factory            │
│   • Architecture-specific → unified format                                  │
│   • One input event → zero or more SessionEvents                            │
│                                                                             │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SESSION EVENTS                                    │
│                                                                             │
│   Unified event format: { type, payload, context }                          │
│                                                                             │
│   Block Events          Subagent Events        Operational Events           │
│   ─────────────         ───────────────        ──────────────────           │
│   block:upsert          subagent:spawned       metadata:update              │
│   block:delta           subagent:completed     query:started/completed      │
│   session:idle                                 ee:ready/terminated          │
│                                                                             │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
┌───────────────────────────────┐ ┌───────────────────────────────────────────┐
│     CONVERSATION REDUCER      │ │          OTHER STATE HANDLERS             │
│                               │ │                                           │
│ • Builds conversation state   │ │ • SessionState class (server)             │
│ • Handles block:*, subagent:* │ │ • Handles ee:*, query:*, metadata:*       │
│ • Shared: server + client     │ │ • Manages EE, files, transcript           │
│ • Immutable updates           │ │                                           │
└───────────────┬───────────────┘ └───────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      SESSION CONVERSATION STATE                             │
│                                                                             │
│   blocks: ConversationBlock[]      Main conversation                        │
│   subagents: SubagentState[]       Nested agent conversations               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Two Paths to State

### Streaming (Real-time)

During active queries, events stream through the pipeline:

```
SDK Stream → Converter → block:upsert(pending) → Reducer → State
                       → block:delta           → Reducer → State (content appends)
                       → block:upsert(complete) → Reducer → State (finalized)
```

### Transcript Loading (Persistence)

When loading saved sessions, transcripts are parsed:

```
Disk → parseTranscript() → block:upsert(complete) → Reducer → State
       (no deltas - blocks already finalized)
```

Both paths use the **same reducer**, ensuring parity between live and restored sessions.

## Documentation

| Document | Purpose |
|----------|---------|
| [Conversation State](./conversation-state.md) | State machine for blocks and subagents |
| [Streaming and Events](./streaming-and-events.md) | Event flow from SDK to client |
| [OpenCode Event Reference](./reference/opencode-event-reference.md) | Complete OpenCode SSE event catalog |

## Event Mapping

How architecture-specific events become unified SessionEvents:

### OpenCode → SessionEvent

| OpenCode Event | SessionEvent | Notes |
|----------------|--------------|-------|
| `message.updated` (role=user) | `block:upsert` | Creates UserMessageBlock |
| `message.part.updated` (type=text) | `block:upsert` + `block:delta` | Text streaming |
| `message.part.updated` (type=tool) | `block:upsert` | Tool use/result blocks |
| `message.part.updated` (type=tool, name=Task) | `subagent:spawned` | Subagent lifecycle |
| `session.idle` | `session:idle` | Finalizes pending blocks |

### Claude SDK → SessionEvent

| SDK Event | SessionEvent | Notes |
|-----------|--------------|-------|
| `content_block_start` (text) | `block:upsert` | Creates text block |
| `content_block_delta` | `block:delta` | Appends content |
| `content_block_start` (tool_use, Task) | `subagent:spawned` | Subagent lifecycle |
| `tool_use_result` (with agentId) | `subagent:completed` | Subagent finalization |
| `message_stop` | `block:upsert` | Finalizes blocks |

## State Types

The session system manages multiple state types:

| State | Events | Managed By |
|-------|--------|------------|
| **Conversation** | `block:*`, `subagent:*`, `session:idle` | Shared reducer |
| **Execution Environment** | `ee:creating`, `ee:ready`, `ee:terminated` | SessionState |
| **Query** | `query:started`, `query:completed`, `query:failed` | SessionState |
| **Metadata** | `metadata:update` | Client reducer |
| **Files** | `file:created`, `file:modified`, `file:deleted` | SessionState |
| **Transcript** | `transcript:changed`, `transcript:written` | SessionState |

Only **conversation state** uses the shared reducer. Other state is managed by the server's SessionState class and propagated via events.

## Where It Lives

| Concern | Location |
|---------|----------|
| SessionEvent types | `packages/types/src/runtime/session-events.ts` |
| ConversationBlock types | `packages/types/src/runtime/blocks.ts` |
| Conversation state types | `packages/types/src/runtime/conversation-state.ts` |
| Shared reducer | `packages/converters/src/session-state/reducer.ts` |
| OpenCode converter | `packages/converters/src/opencode/block-converter.ts` |
| Claude SDK converter | `packages/converters/src/claude-sdk/block-converter.ts` |
| SessionState (server) | `runtime/server/src/core/session/session-state.ts` |
| SessionEventBus | `runtime/server/src/core/session/session-event-bus.ts` |
