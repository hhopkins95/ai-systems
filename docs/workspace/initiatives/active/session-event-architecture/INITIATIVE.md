---
title: Session Event Architecture
created: 2025-12-12
status: active
---

# Session Event Architecture

## Goal

Refactor the session architecture so that each `AgentSession` owns its own event infrastructure, making sessions self-contained "actors" that can be hosted anywhere. This is the foundational refactoring that enables future deployment flexibility (single host, clustered, Durable Objects) without committing to any specific target yet.

## Background

The current architecture has a centralized event system:
- Single `EventBus` singleton shared across all sessions
- Socket.IO rooms handle per-session routing externally
- Sessions emit to shared bus, transport layer picks up and routes

This couples sessions to their hosting environment. Moving a session to a different host (or deployment target like Durable Objects) would require significant rewiring.

## Target Architecture

```
AgentSession (coordinator / owner)
  │
  ├── SessionState ────────────── the data (serializable)
  │
  ├── SessionEventBus ─────────── pub/sub channel (per-session)
  │         ▲
  │         │ subscribe
  │    ┌────┴────┬─────────────────┐
  │    │         │                 │
  ├── ClientHub  │                 │
  │    (→ clients)                 │
  │              │                 │
  ├── PersistenceListener         │
  │    (→ storage)                │
  │                               │
  └── ExecutionEnvironment ───────┘
           (emits to bus)
```

### Key Principles

- **Session as Actor**: Each session is self-contained with its own event bus
- **Transport Agnostic**: ClientHub abstracts "who is listening" - could be Socket.IO, raw WebSocket, DO connections
- **Decoupled Persistence**: PersistenceListener subscribes to events, session doesn't call persistence directly
- **Injected Dependencies**: ExecutionEnvironment receives the bus, emits directly (no translation layer)

## Scope

**In scope:**
- Create `SessionState` class (extract state from AgentSession)
- Create `SessionEventBus` (per-session typed event emitter)
- Create `ClientHub` interface and Socket.IO implementation
- Create `PersistenceListener` (subscribes to events, syncs to storage)
- Refactor `ExecutionEnvironment` to accept injected bus and emit directly
- Refactor `AgentSession` to be a coordinator that wires components together
- Refactor WebSocket transport layer to be an adapter that subscribes to ClientHub
- Update `SessionManager` (no longer owns global EventBus)
- Remove or repurpose global `EventBus` (keep only for truly global events like `sessions:changed`)

**Out of scope:**
- SessionHost abstraction (future initiative)
- Durable Objects deployment target (future initiative)
- Clustered/multi-host deployment (future initiative)
- Client-side changes (event protocol stays the same)
- Changing event shapes or adding new events

## Completion Criteria

- [ ] `SessionState` class exists with `toSnapshot()` / `fromSnapshot()` methods
- [ ] `SessionEventBus` is instantiated per-session, not shared
- [ ] `ClientHub` interface defined, Socket.IO adapter implemented
- [ ] `PersistenceListener` handles all storage sync via event subscription
- [ ] `ExecutionEnvironment` emits directly to injected bus (no yield/callback translation)
- [ ] `AgentSession` is purely a coordinator (owns pieces, wires them, manages lifecycle)
- [ ] WebSocket transport is an adapter that subscribes to sessions
- [ ] Global `EventBus` only handles `sessions:changed` (or is removed entirely)
- [ ] All existing functionality works (no client-side breaking changes)
- [ ] Documentation updated

## Component Design Notes

### SessionState
- Contains: `eeStatus`, `activeQueryStartedAt`, `blocks`, `subagents`, `rawTranscript`, `workspaceFiles`
- Methods: `isQueryActive()`, `toSnapshot()`, `fromSnapshot()`, `applyEvent()` (optional, for event sourcing)
- Should be serializable for future DO migration

### SessionEventBus
- Typed wrapper around EventEmitter (like current EventBus, but per-session)
- Events: `block:start`, `block:delta`, `block:update`, `block:complete`, `status`, `file:modified`, `error`
- No `sessions:changed` - that stays global

### ClientHub
```typescript
interface ClientHub {
  subscribe(clientId: string, callback: (event: SessionEvent) => void): void
  unsubscribe(clientId: string): void
  broadcast(event: SessionEvent): void
  getSubscriberCount(): number
}
```

### PersistenceListener
- Subscribes to SessionEventBus on session creation
- Handles: transcript appends, workspace file updates, session metadata updates
- Replaces direct persistence calls scattered through AgentSession

## Current Status

Not started - initial design complete

## Quick Links

- [Sessions](sessions/)
