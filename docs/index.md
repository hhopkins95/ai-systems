---
title: ai-systems Documentation
description: Monorepo for AI agent runtime, entity management, and tooling
---

# ai-systems

Welcome to the ai-systems documentation.

## Packages

### Runtime

- [agent-server](./packages/agent-server.md) - Node.js runtime for orchestrating AI agents in isolated sandboxes
- [agent-client](./packages/agent-client.md) - React hooks for connecting to agent-server
- [agent-execution](./packages/agent-execution.md) - Environment-agnostic execution scripts for agent queries
- [agent-converters](./packages/agent-converters.md) - Pure transformation functions for parsing agent transcripts

### Tooling

- [claude-entity-manager](./packages/claude-entity-manager.md) - Service for discovering and managing Claude Code entities
- [smart-docs](./packages/smart-docs.md) - Local documentation viewer for AI-native codebases
- [opencode-claude-adapter](./packages/opencode-claude-adapter.md) - Adapter for syncing Claude entities to OpenCode

## Quick Links

- [Getting Started](./guides/getting-started.md)

## Active Plans

- [Monorepo Reorganization](./plans/monorepo-reorganization.md) - Restructuring packages for better separation of concerns

## Session Summaries

- [2024-12-05: Entity Manager Refactor](./session-summaries/2024-12-05-entity-manager-refactor.md)

## Repository Structure

```
ai-systems/
├── packages/
│   ├── runtime/
│   │   ├── server/              # @hhopkins/agent-server
│   │   ├── client/              # @hhopkins/agent-client
│   │   └── execution/           # @hhopkins/agent-runner
│   ├── converters/              # @hhopkins/agent-converters
│   ├── claude-entity-manager/   # @hhopkins/claude-entity-manager
│   ├── shared-types/            # @ai-systems/shared-types
│   └── opencode-claude-adapter/ # opencode-claude-adapter
├── packages/apps/
│   └── smart-docs/              # @hhopkins/smart-docs
├── examples/
│   ├── backend/                 # Example server using agent-server
│   └── frontend/                # Example React app using agent-client
└── plugins/
    └── agent-service/           # Claude Code plugin for agent development
```
