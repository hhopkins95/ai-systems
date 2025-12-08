---
title: "@hhopkins/agent-server"
description: Node.js runtime for orchestrating AI agents in isolated sandboxes with real-time streaming
---

# @hhopkins/agent-server

Node.js runtime for orchestrating AI agents (Claude, Gemini) in isolated sandboxes with real-time streaming and flexible persistence.

## Features

- **Isolated Sandbox Execution** - Run agents in secure, ephemeral sandboxes (Modal, Docker, etc.)
- **Real-time Streaming** - WebSocket-based streaming of agent messages and tool execution
- **Adapter Pattern** - Plug in any persistence layer (Convex, PostgreSQL, MongoDB, etc.)
- **Multi-Architecture** - Support for Claude Agent SDK, OpenCode, and Gemini CLI
- **Session Management** - Complete session lifecycle with state tracking
- **Event-Driven** - Internal event bus for extensibility
- **Type-Safe** - Full TypeScript support with exported types
- **SDK-Agnostic** - Uses [@hhopkins/agent-converters](./agent-converters.md) for normalized transcript parsing

## Installation

```bash
npm install @hhopkins/agent-server
# or
pnpm add @hhopkins/agent-server
```

## Quick Start

### 1. Implement the Persistence Adapter

The runtime requires a persistence adapter to store session data and files. Implement the `PersistenceAdapter` interface for your database:

```typescript
import type { PersistenceAdapter } from '@hhopkins/agent-server/types';

class MyPersistenceAdapter implements PersistenceAdapter {
  constructor(private db: YourDatabase) {}

  async listAllSessions() {
    return await this.db.sessions.findAll();
  }

  async loadSession(sessionId: string) {
    return await this.db.sessions.findById(sessionId);
  }

  async createSessionRecord(session) {
    await this.db.sessions.insert(session);
  }

  async updateSessionRecord(sessionId, updates) {
    await this.db.sessions.update(sessionId, updates);
  }

  async saveTranscript(sessionId, rawTranscript, subagentId?) {
    await this.db.transcripts.upsert({ sessionId, subagentId, content: rawTranscript });
  }

  async saveWorkspaceFile(sessionId, file) {
    await this.db.files.upsert({ sessionId, path: file.path, content: file.content });
  }

  async deleteSessionFile(sessionId, path) {
    await this.db.files.delete({ sessionId, path });
  }

  async listAgentProfiles() {
    return await this.db.agentProfiles.findAll();
  }

  async loadAgentProfile(agentProfileId) {
    return await this.db.agentProfiles.findById(agentProfileId);
  }
}
```

### 2. Configure and Start the Runtime

```typescript
import { AgentRuntime } from '@hhopkins/agent-server';
import type { RuntimeConfig } from '@hhopkins/agent-server/types';

// Create your adapter instance
const persistence = new MyPersistenceAdapter(myDatabase);

// Configure the runtime
const config: RuntimeConfig = {
  persistence,
  modal: {
    tokenId: process.env.MODAL_TOKEN_ID!,
    tokenSecret: process.env.MODAL_TOKEN_SECRET!,
    appName: 'my-app-agents',
  },
  // Optional configuration
  idleTimeoutMs: 15 * 60 * 1000,  // 15 minutes
  syncIntervalMs: 30 * 1000,       // 30 seconds
  websocketPort: 3000,
  logLevel: 'info',
};

// Start the runtime
const runtime = new AgentRuntime(config);
await runtime.start();

console.log('Agent runtime started!');
```

### 3. Connect Your Application

The runtime exposes HTTP and WebSocket APIs:

```typescript
// REST API
POST   /sessions/create         # Create a new session
GET    /sessions                # List all sessions
GET    /sessions/:id            # Get session details
POST   /sessions/:id/message    # Send message to agent
DELETE /sessions/:id            # Terminate session

// WebSocket
ws://localhost:3000              # Real-time session updates
```

Use the [@hhopkins/agent-client](./agent-client.md) package for easy React integration.

## Architecture

```
┌──────────────────────────────────────────────────┐
│                  Your Application                 │
│          (REST API + WebSocket Client)            │
└───────────────────┬──────────────────────────────┘
                    │
┌───────────────────▼──────────────────────────────┐
│              Agent Server (this package)          │
│                                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌───────────┐ │
│  │   HTTP      │  │  WebSocket  │  │   Event   │ │
│  │  Transport  │  │  Transport  │  │    Bus    │ │
│  └──────┬──────┘  └──────┬──────┘  └─────┬─────┘ │
│         │                │               │       │
│  ┌──────▼────────────────▼───────────────▼─────┐ │
│  │          Session Manager                    │ │
│  │  • Lifecycle management                     │ │
│  │  • State synchronization                    │ │
│  │  • Sandbox orchestration                    │ │
│  └──────┬──────────────────────────────────────┘ │
│         │                                        │
└─────────┼────────────────────────────────────────┘
          │
          ├──→ Sandbox (Agent execution via @hhopkins/agent-runner)
          ├──→ Converters (@hhopkins/agent-converters for transcript parsing)
          └──→ Persistence Adapter (Your database)
```

## Key Concepts

**Sessions** - Each agent conversation is a session with:
- Unique session ID
- Agent architecture type (Claude/OpenCode/Gemini)
- Agent profile reference
- Conversation blocks (messages, tool uses, thinking)
- Workspace files
- Raw transcript storage

**Blocks** - Conversations are represented as blocks:
- `user_message` - User input
- `assistant_text` - Agent response
- `tool_use` - Agent using a tool
- `tool_result` - Tool execution result
- `thinking` - Agent's internal reasoning
- `system` - System events
- `subagent` - Subagent invocation

## Related Packages

- [@hhopkins/agent-client](./agent-client.md) - React hooks for connecting to this server
- [@hhopkins/agent-converters](./agent-converters.md) - Transcript parsing (used internally)
- [@hhopkins/agent-runner](./agent-execution.md) - Sandbox execution scripts

## Requirements

- Node.js >= 18
- Modal account ([modal.com](https://modal.com)) for sandbox execution
- Anthropic API key (for Claude agents)

## License

MIT
