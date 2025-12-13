# Architecture Overview

High-level view of the ai-systems monorepo and how packages connect.

## What It Does

The ai-systems platform orchestrates AI agent execution across isolated sandboxes, providing:

- WebSocket-based client-server communication
- Sandbox isolation via Modal for secure agent execution
- Entity management for Claude Code plugins, skills, commands, and agents
- Transcript parsing and streaming for real-time UI updates

## How It Works

```mermaid
flowchart TB
    subgraph Client
        RC[React App] --> AC[agent-client]
    end

    subgraph Server
        AC -->|WebSocket| AS[agent-server]
        AS --> SH[SessionHost]
        SH --> Sessions[AgentSession]
        Sessions --> EE[ExecutionEnvironment]
    end

    subgraph Sandbox["Modal Sandbox"]
        EE -->|spawn| AR[agent-runner]
        AR --> SDK[Claude/OpenCode SDK]
    end

    subgraph Tooling
        CEM[claude-entity-manager]
        CV[converters]
    end

    AS --> CEM
    AR --> CV
```

### Data Flow

1. **Client → Server**: User sends message via WebSocket
2. **Server → Sandbox**: SessionHost locates session, ExecutionEnvironment spawns sandbox
3. **Sandbox Execution**: agent-runner executes query against SDK
4. **Event Streaming**: Events emit to SessionEventBus, broadcast via ClientHub
5. **Transcript Parsing**: converters parse raw output into ConversationBlocks

## Package Categories

| Category | Packages | Purpose |
|----------|----------|---------|
| Runtime | agent-server, agent-client, agent-runner | Agent execution pipeline |
| Converters | converters | Transcript parsing, format conversion |
| Tooling | claude-entity-manager | Entity discovery, plugin management |
| Types | shared-types | Common type definitions |
| Apps | smart-docs | Documentation viewer |

## Key Components

| Component | Package | Purpose |
|-----------|---------|---------|
| SessionHost | agent-server | Interface for session lifecycle and location |
| LocalSessionHost | agent-server | In-memory session hosting implementation |
| AgentSession | agent-server | Individual session with event bus and state |
| ExecutionEnvironment | agent-server | Abstracts sandbox primitives |
| SessionEventBus | agent-server | Per-session typed event emitter |
| ClientHub | agent-server | Broadcasts events to connected clients |
| agent-runner CLI | agent-runner | Executes queries in sandbox |
| ClaudeEntityManager | claude-entity-manager | Loads skills, commands, agents |

## Key Insight

The architecture separates **orchestration** (agent-server) from **execution** (agent-runner). The server never runs agent code directly—it spawns isolated sandboxes and communicates via streams. This enables:

- Security through isolation
- Horizontal scaling of sandboxes
- Clean separation between control plane and data plane

## Where It Lives

| Concern | Location |
|---------|----------|
| Client hooks | `runtime/client/src/` |
| Session internals | `runtime/server/src/core/session/` |
| Host interfaces | `runtime/server/src/core/host/` |
| Local host implementation | `runtime/server/src/hosts/local/` |
| REST routes | `runtime/server/src/transport/rest/` |
| Execution scripts | `runtime/runner/src/` |
| Transcript parsing | `packages/converters/src/` |
| Entity management | `packages/claude-entity-manager/src/` |
| Shared types | `packages/types/src/` |

## Related

- [Core Concepts](./core-concepts.md) - SessionHost, SessionEventBus, ClientHub patterns
- [Agent Execution](./agent-execution.md) - How queries flow through the system
- [Session Lifecycle](./session-lifecycle.md) - Session state management
- [Entity Management](./entity-management.md) - Plugin and entity discovery
