---
title: Session Host Abstraction
created: 2025-12-12
completed: 2025-12-12
status: complete
depends_on: session-event-architecture
---

# Session Host Abstraction

## Goal

Extract a `SessionHost` interface from `SessionManager` that abstracts where sessions live and how they're located. This enables future deployment targets (Durable Objects, clustered nodes) without changing the REST/WebSocket API layer.

## Background

The Session Event Architecture refactor made each `AgentSession` a self-contained actor with its own event bus. However, session lifecycle management is still coupled to the current deployment model:

- `SessionManager` uses an in-memory Map to track loaded sessions
- Global `EventBus` broadcasts `sessions:changed` for WebSocket updates
- WebSocket server handles both global broadcasts and per-session subscriptions

This coupling prevents cleanly swapping in different hosting strategies.

## Key Concepts

### What This Is (and Isn't)

**SessionHost is about:** Where the `AgentSession` coordinator lives and how the server locates/routes to it.

**SessionHost is NOT about:** Where the agent code executes. That's `ExecutionEnvironment` (Modal, Docker, local) - already abstracted, unchanged by this work.

### Mental Model

Clients connect to **sessions**, not to "a server." The server/infrastructure is just routing. For LocalSessionHost, that routing happens via Socket.IO rooms. For Durable Objects, each session IS its own WebSocket endpoint.

### What Varies Between Implementations

| Concern | LocalSessionHost | DurableObjectHost | ClusteredHost |
|---------|------------------|-------------------|---------------|
| **Locate** | `map.get(id)` | `env.SESSION.get(id)` | Redis lookup → node |
| **Invoke** | Direct method call | `stub.fetch(request)` | HTTP/gRPC to node |
| **Create** | `new AgentSession()` | DO auto-creates | Create on least-loaded |
| **ClientHub** | Shared SocketIOClientHub | DO's native WebSocket | Pub/sub between nodes |

### SessionHandle (for remote implementations)

For `LocalSessionHost`, `getSession()` returns the actual `AgentSession` object.

For remote implementations (DO, clustered), it would return a `SessionHandle` - a proxy that forwards calls over the network:

```typescript
interface SessionHandle {
  sendMessage(message: string): Promise<void>;
  getState(): Promise<RuntimeSessionData>;
  updateOptions(options: SessionOptions): Promise<void>;
  terminate(): Promise<void>;
}

// LocalSessionHost: AgentSession implements SessionHandle directly
// DOSessionHost: Returns a proxy that calls stub.fetch() under the hood
```

For this initiative, we only implement LocalSessionHost where `AgentSession` is used directly. The SessionHandle abstraction is noted here for future reference.

## Target Architecture

```
Runtime
├── SessionHost (interface)
│     └── LocalSessionHost (current: in-memory Map + AgentSession)
├── PersistenceAdapter (REST queries session list)
├── ClientHub (injected into SessionHost for per-session broadcasts)
└── Socket.IO server (minimal: session subscribe/unsubscribe only)
```

### Key Changes

1. **SessionHost interface** - Abstracts session lifecycle operations
2. **LocalSessionHost** - Current SessionManager logic, renamed and cleaned up
3. **Remove global EventBus** - No longer needed
4. **Remove `sessions:changed` / `sessions:list` WebSocket events** - Session list is REST-only
5. **Simplify WebSocket server** - Only handles per-session subscriptions

### Future Implementations (out of scope)

```typescript
// Durable Objects
class DurableObjectSessionHost implements SessionHost {
  getSession(id) {
    return new DOSessionHandle(this.env.SESSION.get(id));
  }
}

// Clustered
class ClusteredSessionHost implements SessionHost {
  getSession(id) {
    const nodeAddress = await this.redis.get(`session:${id}:node`);
    return new RemoteSessionHandle(nodeAddress, id);
  }
}
```

## Interface Design

```typescript
// session-host.ts
interface SessionHost {
  /** Get a loaded session (undefined if not loaded) */
  getSession(sessionId: string): AgentSession | undefined;

  /** Create a new session */
  createSession(args: CreateSessionArgs): Promise<AgentSession>;

  /** Load existing session from persistence */
  loadSession(sessionId: string): Promise<AgentSession>;

  /** Unload session (sync to persistence, cleanup) */
  unloadSession(sessionId: string): Promise<void>;

  /** Check if session is loaded */
  isSessionLoaded(sessionId: string): boolean;

  /** Get all loaded session IDs */
  getLoadedSessionIds(): string[];

  /** Graceful shutdown */
  shutdown(): Promise<void>;

  /** Set the ClientHub for session event broadcasting */
  setClientHub(clientHub: ClientHub): void;
}
```

## Scope

**In scope:**
- Create `SessionHost` interface
- Create `LocalSessionHost` implementing current behavior
- Remove global `EventBus` class and all references
- Remove `sessions:changed` event and `sessions:list` WebSocket broadcast
- Delete/simplify `event-listeners.ts`
- Update `runtime.ts` to use SessionHost instead of SessionManager
- Update REST routes to fetch session list from persistence directly
- Simplify WebSocket server to session subscriptions only

**Out of scope:**
- DurableObjectSessionHost implementation
- ClusteredSessionHost implementation
- Changes to AgentSession or per-session event architecture
- Client-side changes (they should fetch session list via REST)

## Completion Criteria

- [x] `SessionHost` interface defined in `runtime/server/src/core/session/`
- [x] `LocalSessionHost` implements interface with current behavior
- [x] `EventBus` class deleted
- [x] `sessions:changed` event removed
- [x] `sessions:list` WebSocket event removed
- [x] `event-listeners.ts` deleted
- [x] `runtime.ts` exposes `sessionHost` instead of `sessionManager`
- [x] REST endpoint for listing sessions queries persistence directly
- [x] WebSocket server only handles `session:join` / `session:leave`
- [x] All existing per-session functionality works unchanged
- [x] Build passes, no regressions

## Files to Modify

| File | Changes |
|------|---------|
| `core/session-manager.ts` | Rename to `local-session-host.ts`, implement interface |
| `core/event-bus.ts` | Delete |
| `core/session/index.ts` | Export SessionHost interface |
| `transport/websocket/event-listeners.ts` | Delete |
| `transport/websocket/index.ts` | Remove global event listener setup |
| `transport/rest/server.ts` | Update session list endpoint |
| `runtime.ts` | Use SessionHost, remove EventBus |

## Files to Create

| File | Purpose |
|------|---------|
| `core/session/session-host.ts` | SessionHost interface |
| `core/session/local-session-host.ts` | LocalSessionHost implementation |

## Migration Notes

- Session list is now REST-only. Clients polling for session list updates should use the REST endpoint.
- No changes to per-session WebSocket events (block streaming, status, etc.)
- The `ClientHub` pattern remains unchanged

## Current Status

**COMPLETE** - Implemented on 2025-12-12

### Phase 1: SessionHost Interface (Session 1)

1. Created `SessionHost` interface (`core/session/session-host.ts`)
2. Created `LocalSessionHost` implementing the interface (`core/session/local-session-host.ts`)
3. Deleted global `EventBus` class and `event-listeners.ts`
4. Deleted `SessionManager` (logic moved to `LocalSessionHost`)
5. Updated `runtime.ts` to expose `sessionHost` instead of `sessionManager`
6. Updated REST routes to use `LocalSessionHost`
7. Updated WebSocket server to remove global event broadcasting
8. Removed `sessions:list` WebSocket event from server and client
9. Updated example-backend to use new API

### Phase 2: Decouple Host from Transport (Session 2)

1. Reorganized core folder structure:
   - `core/session/` - Session internals (agent-session, execution-environment, events, state)
   - `core/host/` - Host primitives (interfaces only)
2. Created host factories in `hosts/local/`:
   - `createLocalHost()` - bundles LocalSessionHost + Socket.IO transport
   - ClientHub is now internal to host (callers never see it)
3. Updated runtime to accept `sessionHost` in config (removed `createWebSocketServer`)
4. REST routes now use `SessionHost` interface (not concrete type)
5. Deleted `transport/websocket/` - Socket.IO setup moved to `hosts/local/`

### Final Architecture

```
runtime/server/src/
├── core/
│   ├── session/          # Session internals
│   └── host/             # Host primitives (interfaces)
├── hosts/
│   └── local/            # createLocalHost() + Socket.IO
├── transport/
│   └── rest/             # REST routes (use SessionHost interface)
└── runtime.ts            # Accepts sessionHost
```

**New usage pattern:**
```typescript
const host = createLocalHost({ persistence, executionEnvironment });
const runtime = await createAgentRuntime({ sessionHost: host.sessionHost });
host.attachTransport(httpServer);
```

Session list is now REST-only. Per-session events continue via `SessionEventBus` → `ClientBroadcastListener` → `ClientHub`.

## Quick Links

- [Depends on: Session Event Architecture](../session-event-architecture/)
- [Sessions](sessions/)
