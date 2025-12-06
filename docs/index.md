---
title: ai-systems Documentation
description: Monorepo for AI agent runtime, entity management, and tooling
---

# ai-systems

Welcome to the ai-systems documentation.

## Packages

- [agent-runtime](./packages/agent-runtime.md) - Node.js runtime for orchestrating AI agents in isolated Modal sandboxes
- [agent-runtime-react](./packages/agent-runtime-react.md) - React hooks for connecting to agent-runtime
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
│   ├── agent-runtime/           # @hhopkins/agent-runtime
│   ├── agent-runtime-react/     # @hhopkins/agent-runtime-react
│   ├── claude-entity-manager/   # @hhopkins/claude-entity-manager
│   ├── smart-docs/              # @hhopkins/smart-docs
│   └── opencode-claude-adapter/ # opencode-claude-adapter
├── examples/
│   ├── backend/                 # Example server using agent-runtime
│   └── frontend/                # Example React app using agent-runtime-react
└── plugins/
    └── agent-service/           # Claude Code plugin for agent development
```
