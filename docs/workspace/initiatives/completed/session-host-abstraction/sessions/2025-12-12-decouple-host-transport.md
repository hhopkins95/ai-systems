---
date: 2025-12-12
title: Decouple Host from Transport
---

# Session: Decouple Host from Transport

## Summary

Refactored the runtime architecture to make `ClientHub` an internal implementation detail of each host type. The transport (Socket.IO) is now bundled with the host, so callers create a host and attach its transport without ever thinking about `ClientHub`.

## Changes Made

### 1. Reorganized Core Folder Structure

**Before:**
```
core/
├── agent-session.ts           # Outside session/
├── execution-environment.ts   # Outside session/
└── session/
    ├── session-host.ts        # Host infra mixed in
    ├── local-session-host.ts
    ├── client-hub.ts
    └── ...event infrastructure
```

**After:**
```
core/
├── session/                   # Session internals
│   ├── agent-session.ts       # Moved in
│   ├── execution-environment.ts
│   ├── session-event-bus.ts
│   ├── session-state.ts
│   ├── client-broadcast-listener.ts
│   ├── persistence-listener.ts
│   └── index.ts
└── host/                      # Host primitives (interfaces only)
    ├── session-host.ts
    ├── client-hub.ts
    └── index.ts
```

### 2. Created Host Factories

Created `hosts/local/` with pre-configured local host:

```
hosts/
├── local/
│   ├── local-session-host.ts   # Moved from core/host/
│   ├── socket-io-client-hub.ts # Moved from transport/websocket/
│   ├── connection-handlers.ts  # Moved from transport/websocket/handlers/
│   └── index.ts               # createLocalHost() factory
└── index.ts
```

### 3. Updated Runtime API

**Before:**
```typescript
const runtime = await createAgentRuntime({
  persistence,
  executionEnvironment,
});
const wsServer = runtime.createWebSocketServer(httpServer);
```

**After:**
```typescript
const host = createLocalHost({ persistence, executionEnvironment });
const runtime = await createAgentRuntime({ sessionHost: host.sessionHost });
host.attachTransport(httpServer);
```

### 4. Updated SessionHost Interface

Added methods to the interface:
- `getAllSessions()` - for REST session listing
- `isHealthy()` - for health checks

### 5. Removed Old Transport Layer

Deleted `transport/websocket/` folder - Socket.IO setup is now internal to `hosts/local/`.

## Files Changed

| Action | File |
|--------|------|
| **Created** | `hosts/local/index.ts` |
| **Created** | `hosts/index.ts` |
| **Moved** | `core/agent-session.ts` → `core/session/agent-session.ts` |
| **Moved** | `core/execution-environment.ts` → `core/session/execution-environment.ts` |
| **Moved** | `core/host/local-session-host.ts` → `hosts/local/local-session-host.ts` |
| **Moved** | `transport/websocket/socket-io-client-hub.ts` → `hosts/local/socket-io-client-hub.ts` |
| **Moved** | `transport/websocket/handlers/session-lifecycle.ts` → `hosts/local/connection-handlers.ts` |
| **Updated** | `runtime.ts` - accepts `sessionHost` in config |
| **Updated** | `core/host/index.ts` - removed LocalSessionHost export |
| **Updated** | `core/session/index.ts` - added AgentSession, ExecutionEnvironment exports |
| **Updated** | `transport/rest/server.ts` - uses SessionHost interface |
| **Updated** | `transport/rest/routes/sessions.ts` - uses SessionHost interface |
| **Updated** | `transport/rest/routes/messages.ts` - uses SessionHost interface |
| **Updated** | `index.ts` - new exports |
| **Updated** | `apps/example-backend/src/server.ts` - uses new pattern |
| **Deleted** | `transport/websocket/` folder |

## Design Decisions

1. **ClientHub is internal** - Each host type knows its transport. LocalSessionHost always uses Socket.IO, DurableObjectSessionHost would use DO's native WebSocket.

2. **Host factories bundle everything** - `createLocalHost()` returns `{ sessionHost, attachTransport() }`. The caller never sees ClientHub.

3. **REST routes use interface** - Routes depend on `SessionHost` interface, not `LocalSessionHost` concrete type. This allows different hosts to work with the same REST layer.

4. **Runtime is transport-agnostic** - `createAgentRuntime()` no longer knows about Socket.IO. It just takes a `sessionHost`.

## Next Steps

This architecture enables future host implementations:

```typescript
// Durable Objects (future)
export class AgentSessionDO extends DurableObject {
  // Transport is handled internally via ctx.acceptWebSocket()
  // ClientHub broadcasts to this.ctx.getWebSockets()
}

// Clustered (future)
export function createClusteredHost(config) {
  // Uses Redis for session location
  // Pub/sub for cross-node ClientHub
}
```

## Build Status

All builds pass.
