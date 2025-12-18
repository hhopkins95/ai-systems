---
title: Event-Driven Session State
created: 2025-12-17
status: active
---

# Event-Driven Session State

## Goal

Refactor the session architecture to make `SessionState` event-driven and `AgentSession` thinner. Currently, `AgentSession` acts as an intermediary between events and state updates. By having `SessionState` subscribe directly to the event bus, we achieve better separation of concerns and follow the same pattern already used by `PersistenceListener` and `ClientBroadcastListener`.

## Scope

**In scope:**
- Make `SessionState` subscribe to EventBus and handle its own state updates
- Move event listener logic from `AgentSession.setupEventListeners()` to `SessionState`
- Make `SessionState` setters private (only called internally)
- `SessionState` constructor takes raw transcript, parses internally (removes parsing from AgentSession)
- Add new lifecycle events for better observability and component coordination
- `AgentSession` emits lifecycle events at appropriate transition points

**Out of scope:**
- Agent context viewing/exposure (separate future initiative)
- Cumulative stats tracking (totalTokens, queryCount, etc.) - maybe future
- Health monitoring as separate component (keeping in AgentSession for now)
- Sync scheduler as separate component (keeping in AgentSession for now)

## New Events

### Session Lifecycle
| Event | Emitter | Payload | Purpose |
|-------|---------|---------|---------|
| `session:initialized` | AgentSession | `{ isNew, hasTranscript, workspaceFileCount, blockCount }` | Session ready with metadata |

### Execution Environment Lifecycle
| Event | Emitter | Payload | Purpose |
|-------|---------|---------|---------|
| `ee:creating` | AgentSession | `{ statusMessage? }` | EE creation starting |
| `ee:ready` | AgentSession | `{ eeId }` | EE fully initialized |
| `ee:terminated` | AgentSession | `{ reason: 'manual' \| 'unhealthy' \| 'idle' }` | EE shut down |

### Query Lifecycle
| Event | Emitter | Payload | Purpose |
|-------|---------|---------|---------|
| `query:started` | AgentSession | `{ message }` | User message received, query begins |
| `query:completed` | AgentSession | `{ durationMs }` | Query finished successfully |
| `query:failed` | AgentSession | `{ error }` | Query errored |

### Transcript (EE-side)
| Event | Emitter | Payload | Purpose |
|-------|---------|---------|---------|
| `transcript:changed` | ExecutionEnvironment | `{ content }` | Transcript content updated |
| `transcript:written` | ExecutionEnvironment | `{ }` | Transcript written to EE filesystem |

## SessionState Event Subscriptions

| Event | Handler Action |
|-------|----------------|
| `block:start` | Add new block to state |
| `block:complete` | Finalize block in state |
| `block:update` | Update block in state |
| `file:created` | Add workspace file |
| `file:modified` | Update workspace file |
| `file:deleted` | Remove workspace file |
| `error` | Set lastError |

## Architecture Changes

### Before
```
AgentSession
├── setupEventListeners() - listens to events, calls state setters
├── state.setBlocks(), state.setRawTranscript(), etc.
└── Parses transcript before creating SessionState

SessionState
├── Public setters
└── Pure data container
```

### After
```
AgentSession
├── Creates components, wires to event bus
├── Emits lifecycle events (ee:*, query:*, session:initialized)
├── Handles health monitoring, periodic sync
└── Public API (sendMessage, destroy, getState)

SessionState
├── Subscribes to event bus in constructor
├── Private setters (called by internal event handlers)
├── Constructor takes raw transcript, parses internally
└── Handles block/file/error events autonomously
```

## Completion Criteria

- [x] Add new event types to `session-events.ts`
- [x] `SessionState` subscribes to EventBus in constructor
- [x] `SessionState` handles block events (`block:start`, `block:complete`, `block:update`)
- [x] `SessionState` handles file events (`file:created`, `file:modified`, `file:deleted`)
- [x] `SessionState` handles error events
- [x] `SessionState` handles EE lifecycle events (`ee:creating`, `ee:ready`, `ee:terminated`)
- [x] `SessionState` handles query lifecycle events (`query:started`, `query:completed`, `query:failed`)
- [x] `SessionState` handles options events (`options:update`)
- [x] `SessionState` setters made private
- [x] `SessionState` constructor accepts raw transcript and parses internally
- [x] `AgentSession.setupEventListeners()` removed
- [x] `AgentSession` emits `session:initialized` event
- [x] `AgentSession` emits `ee:creating`, `ee:ready`, `ee:terminated` events
- [x] `AgentSession` emits `query:started`, `query:completed`, `query:failed` events
- [x] `ExecutionEnvironment` emits `transcript:changed` event (verified - already exists)
- [x] `ExecutionEnvironment` emits `transcript:written` event
- [x] Build passes
- [ ] Runtime testing
- [x] Documentation updated

## Design Decisions

1. **Status emission stays in AgentSession** - Keeps status emission in one place; SessionState focuses on state management without needing to know what constitutes a "status-worthy" change.

2. **Constructor for initial hydration, events for live updates** - Simpler than emitting initialization events; constructor handles restore from persistence, events handle runtime changes.

3. **Blocks come from streaming events, not transcript parsing** - During live sessions, `block:*` events update state directly. Transcript is for persistence/resumption. Initial load parses transcript once in constructor.

4. **Transcript events are EE-side concerns** - `transcript:changed` and `transcript:written` deal with the execution environment filesystem, not SessionState's block management.

5. **Fully event-driven state updates** - SessionState listens to ALL state-changing events (including EE lifecycle, query lifecycle, options). AgentSession emits events rather than calling state setters directly. This ensures consistent, auditable state changes.

6. **Removed manual EE sync** - `syncSessionStateWithExecutionEnvironment()` was removed since state is now kept up-to-date via events. The event-driven model eliminates the need for pull-based synchronization.

## Current Status

**Server implementation complete.** SessionState is now fully event-driven. Build passes.

**Client updated.** The `@hhopkins/agent-client` package now handles all new lifecycle events:
- `ee:creating`, `ee:ready`, `ee:terminated` dispatch `EE_STATUS_CHANGED` actions
- `session:initialized`, `query:*`, `transcript:written` are acknowledged (no state changes needed)
- New `EEStatus` type exported for UI components to display EE state
- New `eeStatus` field on `SessionState` in reducer

**Pending:** Runtime testing to verify events flow correctly end-to-end.

## Quick Links

- [Sessions](sessions/)
- [SessionState](/runtime/server/src/core/session/session-state.ts)
- [AgentSession](/runtime/server/src/core/session/agent-session.ts)
- [Session Events](/packages/types/src/runtime/session-events.ts)
