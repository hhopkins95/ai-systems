# Hosting Strategies

How to deploy agent sessions using different hosting strategies.

## Overview

The `SessionHost` interface enables different deployment strategies without changing application code. Each strategy handles session lifecycle (create, load, unload) and client routing differently.

## Available Strategies

### LocalSessionHost (Current)

In-memory session hosting for single-server deployments.

```typescript
import { createAgentRuntime } from '@hhopkins/agent-server';

const runtime = await createAgentRuntime({
  persistence: myPersistenceAdapter,
  executionEnvironment: { type: 'modal', modal: {...} },
  host: { type: 'local' }
});

runtime.attachTransport?.(httpServer);
```

**Characteristics:**
- Sessions stored in an in-memory Map
- Socket.IO for client connections
- All sessions on single server
- Simplest deployment model

**Best for:**
- Development and testing
- Single-server production deployments
- Applications with predictable session counts

### Future: DurableObjectSessionHost

Each session as a Cloudflare Durable Object (not yet implemented).

**Would provide:**
- Per-session WebSocket endpoints
- Automatic session location
- Global distribution
- Session hibernation

**Best for:**
- Edge deployments
- Cloudflare Workers environments
- Applications needing global low-latency

### Future: ClusteredSessionHost

Redis-coordinated session distribution (not yet implemented).

**Would provide:**
- Session routing via Redis lookup
- Pub/sub for cross-node events
- Horizontal scaling
- Session migration between nodes

**Best for:**
- High-availability requirements
- Large session counts
- Kubernetes deployments

## Choosing a Strategy

| Requirement | Recommended Strategy |
|-------------|---------------------|
| Simple deployment | LocalSessionHost |
| Single server | LocalSessionHost |
| Edge/global | DurableObjectSessionHost |
| Horizontal scaling | ClusteredSessionHost |
| Kubernetes | ClusteredSessionHost |

## Swapping Strategies

The config-driven API means only the `host` configuration changes:

```typescript
// Local hosting
const runtime = await createAgentRuntime({
  persistence,
  executionEnvironment,
  host: { type: 'local' }
});

// Future: Durable Objects (same API, different host config)
const runtime = await createAgentRuntime({
  persistence,
  executionEnvironment,
  host: { type: 'durable-object', env }
});

// Future: Clustered (same API, different host config)
const runtime = await createAgentRuntime({
  persistence,
  executionEnvironment,
  host: { type: 'clustered', redis: { url: '...' } }
});
```

REST routes automatically work with any host type.

## Key Insight

SessionHost abstracts **where sessions live** (location, routing), not **where code executes**. ExecutionEnvironment (Modal, Docker, local) remains separate and unchanged regardless of hosting strategy.

## Related

- [Core Concepts](../system/core-concepts.md) - SessionHost, SessionEventBus, ClientHub patterns
- [agent-server](../packages/agent-server.md) - Package documentation
- [Session Lifecycle](../system/session-lifecycle.md) - How sessions are managed
