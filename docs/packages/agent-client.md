---
title: "@hhopkins/agent-client"
description: React hooks and client library for connecting to @hhopkins/agent-server
---

# @hhopkins/agent-client

React hooks and client library for connecting to [@hhopkins/agent-server](./agent-server.md). Provides type-safe, real-time access to AI agent sessions with support for message streaming, file tracking, and subagent conversations.

## Features

- **Type-safe React hooks** for session management
- **Real-time WebSocket updates** for streaming responses
- **Context-based state management** with optimized re-renders
- **Full TypeScript support** with comprehensive type definitions
- **Architecture-agnostic** - works with Claude SDK, OpenCode, and Gemini CLI
- **Session lifecycle management** - create, load, destroy sessions
- **Message streaming** - real-time conversation blocks
- **File workspace tracking** - monitor agent-created files
- **Subagent support** - nested agent conversations (Claude SDK)

## Installation

```bash
npm install @hhopkins/agent-client
# or
pnpm add @hhopkins/agent-client
```

## Quick Start

### 1. Wrap your app with the provider

```tsx
import { AgentServiceProvider } from '@hhopkins/agent-client';

function App() {
  return (
    <AgentServiceProvider
      apiUrl="http://localhost:3002"
      wsUrl="http://localhost:3003"
      apiKey="your-api-key"
      debug={process.env.NODE_ENV === 'development'}
    >
      <YourApp />
    </AgentServiceProvider>
  );
}
```

### 2. Use hooks in your components

```tsx
import {
  useAgentSession,
  useMessages,
  useWorkspaceFiles,
} from '@hhopkins/agent-client';

function ChatInterface() {
  const { session, createSession, destroySession } = useAgentSession();
  const { blocks, sendMessage, isStreaming } = useMessages(session?.info.sessionId || '');
  const { files } = useWorkspaceFiles(session?.info.sessionId || '');

  async function handleCreateSession() {
    const sessionId = await createSession('my-agent-profile', 'claude-agent-sdk');
    console.log('Created session:', sessionId);
  }

  return (
    <div>
      {!session ? (
        <button onClick={handleCreateSession}>Start New Session</button>
      ) : (
        <>
          <ConversationView blocks={blocks} isStreaming={isStreaming} />
          <MessageInput onSend={sendMessage} disabled={isStreaming} />
          <FileList files={files} />
          <button onClick={destroySession}>End Session</button>
        </>
      )}
    </div>
  );
}
```

## Core Hooks

### `useSessionList()`

Access and manage the list of all sessions.

```tsx
const { sessions, isLoading, refresh, getSession } = useSessionList();
```

### `useAgentSession(sessionId?)`

Manage a single agent session lifecycle.

```tsx
const {
  session,
  status,
  isLoading,
  error,
  createSession,
  loadSession,
  destroySession,
  syncSession,
} = useAgentSession();
```

### `useMessages(sessionId)`

Access conversation blocks and send messages.

```tsx
const {
  blocks,
  metadata,
  isStreaming,
  error,
  sendMessage,
  getBlock,
  getBlocksByType,
} = useMessages(sessionId);
```

### `useWorkspaceFiles(sessionId)`

Track files created/modified by the agent.

```tsx
const {
  files,
  isLoading,
  getFile,
  getFilesByPattern,
  getFilesByExtension,
} = useWorkspaceFiles(sessionId);
```

### `useSubagents(sessionId)`

Access subagent conversations (Claude SDK only).

```tsx
const {
  subagents,
  count,
  hasRunningSubagents,
  getSubagent,
  getSubagentBlocks,
} = useSubagents(sessionId);
```

## Types

### Conversation Blocks

```typescript
type ConversationBlock =
  | UserMessageBlock      // User input
  | AssistantTextBlock    // Agent text response
  | ToolUseBlock          // Agent tool invocation
  | ToolResultBlock       // Tool execution result
  | ThinkingBlock         // Agent reasoning
  | SystemBlock           // System events
  | SubagentBlock;        // Subagent reference
```

### Session Status

```typescript
type SessionStatus =
  | "pending"
  | "active"
  | "inactive"
  | "completed"
  | "failed"
  | "building-sandbox";
```

## Type Guards

```tsx
import { isAssistantTextBlock, isToolUseBlock } from '@hhopkins/agent-client';

function BlockRenderer({ block }: { block: ConversationBlock }) {
  if (isAssistantTextBlock(block)) {
    return <div>{block.content}</div>;
  }

  if (isToolUseBlock(block)) {
    return <ToolCallDisplay toolName={block.toolName} input={block.input} />;
  }

  // ... handle other block types
}
```

## Related Packages

- [@hhopkins/agent-server](./agent-server.md) - The backend server this client connects to
- [@hhopkins/agent-converters](./agent-converters.md) - Shared types and converters

## License

MIT
