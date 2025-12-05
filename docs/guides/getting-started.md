---
title: Getting Started
description: Quick start guide for the ai-systems monorepo
---

# Getting Started

This guide will help you get started with the ai-systems monorepo.

## Prerequisites

- Node.js >= 20
- pnpm >= 9

## Installation

Clone the repository and install dependencies:

```bash
cd ai-systems
pnpm install
```

## Building

Build all packages:

```bash
pnpm build
```

Build a specific package:

```bash
pnpm --filter @hhopkins/agent-runtime build
```

## Development

Start development servers (where applicable):

```bash
pnpm dev
```

## Packages Overview

### Core Runtime

- **[@hhopkins/agent-runtime](../packages/agent-runtime.md)** - The core Node.js runtime for orchestrating AI agents in Modal sandboxes
- **[@hhopkins/agent-runtime-react](../packages/agent-runtime-react.md)** - React hooks for connecting to the agent runtime

### Tooling

- **[@hhopkins/claude-entity-manager](../packages/claude-entity-manager.md)** - Library for discovering and managing Claude Code entities
- **[@hhopkins/smart-docs](../packages/smart-docs.md)** - Local documentation viewer
- **[opencode-claude-adapter](../packages/opencode-claude-adapter.md)** - Sync Claude entities to OpenCode

## Examples

The `examples/` directory contains reference implementations:

- **backend** - Example server using `@hhopkins/agent-runtime`
- **frontend** - Example React app using `@hhopkins/agent-runtime-react`

## Plugins

The `plugins/` directory contains Claude Code plugins:

- **agent-service** - Skills for building apps with the agent runtime

To install a plugin from this marketplace:

```bash
claude plugins install agent-service@hhopkins-agent-service
```
