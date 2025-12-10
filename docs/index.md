# ai-systems

Monorepo for AI agent runtime, entity management, and tooling.

## Quick Start

- [Getting Started](./guides/getting-started.md) - Install and run your first agent
- [Architecture Overview](./system/architecture-overview.md) - Understand the system

## System Documentation

Cross-cutting concepts and capabilities:

| Doc | Description |
|-----|-------------|
| [Architecture Overview](./system/architecture-overview.md) | Package relationships and data flow |
| [Agent Execution](./system/agent-execution.md) | How queries flow through sandboxes |
| [Session Lifecycle](./system/session-lifecycle.md) | Session state management |
| [Streaming and Events](./system/streaming-and-events.md) | Real-time event types |
| [Entity Management](./system/entity-management.md) | Plugin and entity discovery |

## Package Documentation

### Runtime

| Package | Description |
|---------|-------------|
| [agent-server](./packages/agent-server.md) | Node.js orchestration with Modal sandboxes |
| [agent-client](./packages/agent-client.md) | React hooks for agent interaction |
| [agent-runner](./packages/agent-runner.md) | Execution scripts for sandboxes |
| [agent-converters](./packages/agent-converters.md) | Transcript parsing and conversion |

### Tooling

| Package | Description |
|---------|-------------|
| [claude-entity-manager](./packages/claude-entity-manager.md) | Entity and plugin discovery |
| [shared-types](./packages/shared-types.md) | Common type definitions |
| [opencode-claude-adapter](./packages/opencode-claude-adapter.md) | OpenCode entity sync |
| [smart-docs](./packages/smart-docs.md) | Documentation viewer |

## Guides

| Guide | Description |
|-------|-------------|
| [Getting Started](./guides/getting-started.md) | Installation and first run |
| [Adding New Architecture](./guides/adding-new-agent-architecture.md) | Integrate new AI SDKs |

## Repository Structure

```
ai-systems/
├── runtime/
│   ├── server/     # @hhopkins/agent-server
│   ├── client/     # @hhopkins/agent-client
│   └── runner/     # @hhopkins/agent-runner
├── packages/
│   ├── converters/              # @hhopkins/agent-converters
│   ├── claude-entity-manager/   # @hhopkins/claude-entity-manager
│   ├── types/                   # @ai-systems/shared-types
│   └── opencode-claude-adapter/
├── apps/
│   ├── example-backend/   # Reference server
│   ├── example-frontend/  # Reference React app
│   └── smart-docs/        # @hhopkins/smart-docs
└── plugins/
    ├── smart-docs-authoring/  # Documentation standards
    └── project-tracker/       # Multi-session tracking
```
