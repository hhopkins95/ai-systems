# Hosting Strategies

How to deploy agent sessions using different hosting strategies.

## Overview

The `SessionHost` interface enables different deployment strategies without changing application code. Each strategy handles session lifecycle (create, load, unload) and client routing differently.

## Available Strategies

### LocalSessionHost (Current)

In-memory session hosting for single-server deployments.

```typescript
import { createLocalHost, createAgentRuntime } from '@hhopkins/agent-server';

const host = createLocalHost({
  persistence: myPersistenceAdapter,
  executionEnvironment: config.executionEnvironment,
});

const runtime = await createAgentRuntime({ sessionHost: host.sessionHost });
host.attachTransport(httpServer);
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

The SessionHost interface means application code doesn't change:

```typescript
// Today: Local hosting
const host = createLocalHost({ persistence, executionEnvironment });

// Future: Durable Objects (same pattern, different factory)
const host = createDurableObjectHost({ persistence, executionEnvironment, env });

// Future: Clustered (same pattern, different factory)
const host = createClusteredHost({ persistence, executionEnvironment, redis });

// Runtime setup unchanged
const runtime = await createAgentRuntime({ sessionHost: host.sessionHost });
```

REST routes automatically work with any SessionHost implementation.

## Key Insight

SessionHost abstracts **where sessions live** (location, routing), not **where code executes**. ExecutionEnvironment (Modal, Docker, local) remains separate and unchanged regardless of hosting strategy.

## Related

- [Core Concepts](../system/core-concepts.md) - SessionHost, SessionEventBus, ClientHub patterns
- [agent-server](../packages/agent-server.md) - Package documentation
- [Session Lifecycle](../system/session-lifecycle.md) - How sessions are managed
