---
title: "@hhopkins/agent-runner"
description: Environment-agnostic execution scripts for running agent queries in isolated environments
---

# @hhopkins/agent-runner

Environment-agnostic execution scripts for running agent queries in isolated environments. These scripts are designed to be portable and can run in any sandbox/container environment (Modal, Docker, local processes, etc.).

## Overview

This package contains CLI scripts that:
1. Accept query parameters via command-line arguments
2. Execute queries against agent SDKs (Claude SDK, OpenCode)
3. Stream normalized JSONL output to stdout
4. Use `@hhopkins/agent-converters` for output normalization

The scripts are SDK-specific but environment-agnostic - they don't know or care whether they're running in Modal, Docker, or locally.

## Current Deployment

Currently, these scripts are deployed via the `@hhopkins/agent-server` package which copies them to Modal sandboxes. However, the scripts themselves have no Modal-specific dependencies.

## Scripts

### `claude-sdk.ts`

Executes queries against the Anthropic Agent SDK (Claude Code).

**Usage:**
```bash
npx tsx claude-sdk.ts \
  --session-id "session-123" \
  --query "Write a hello world function" \
  --cwd "/workspace" \
  --model "claude-sonnet-4-20250514"
```

**Output:** JSONL stream events to stdout

### `opencode.ts`

Executes queries against the OpenCode SDK.

**Usage:**
```bash
npx tsx opencode.ts \
  --session-id "session-123" \
  --query "Explain this code" \
  --cwd "/workspace"
```

**Output:** JSONL stream events to stdout

## Output Format

Scripts output JSONL (JSON Lines) to stdout. Each line is a `StreamEvent`:

```jsonl
{"type":"block_start","block":{"type":"assistant_text","id":"blk_123"},"conversationId":"main"}
{"type":"text_delta","blockId":"blk_123","delta":"Hello","conversationId":"main"}
{"type":"text_delta","blockId":"blk_123","delta":" world!","conversationId":"main"}
{"type":"block_complete","blockId":"blk_123","block":{"type":"assistant_text","id":"blk_123","content":"Hello world!"},"conversationId":"main"}
```

## Types

```typescript
import type {
  AgentArchitecture,
  ExecutionContext,
  ExecutionOptions,
  ExecutionResult,
} from '@hhopkins/agent-runner';
```

### `AgentArchitecture`

```typescript
type AgentArchitecture = 'claude-sdk' | 'opencode' | 'gemini';
```

### `ExecutionContext`

Context provided to execution scripts by the sandbox environment:

```typescript
interface ExecutionContext {
  workspaceDir: string;  // Working directory for the agent
  homeDir: string;       // Home directory in sandbox
  appDir: string;        // Application directory
}
```

### `ExecutionOptions`

Options for executing a query:

```typescript
interface ExecutionOptions {
  sessionId: string;
  cwd?: string;
  tools?: string[];
  mcpServers?: Record<string, unknown>;
  model?: string;
}
```

### `ExecutionResult`

Result of executing a query (for non-streaming use cases):

```typescript
interface ExecutionResult {
  blocks: ConversationBlock[];
  metadata?: {
    usage?: {
      inputTokens: number;
      outputTokens: number;
    };
    costUSD?: number;
    durationMs?: number;
  };
}
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              Isolated Environment                    │
│         (Modal / Docker / Local Process)            │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │           Execution Script                     │  │
│  │                                               │  │
│  │  1. Parse CLI arguments                       │  │
│  │  2. Initialize SDK (Claude/OpenCode)          │  │
│  │  3. Execute query                             │  │
│  │  4. Convert output via @hhopkins/converters   │  │
│  │  5. Stream JSONL to stdout                    │  │
│  └───────────────────┬───────────────────────────┘  │
│                      │                              │
│                      ▼                              │
│              stdout (JSONL)                         │
└──────────────────────┼──────────────────────────────┘
                       │
                       ▼
            ┌──────────────────┐
            │  agent-server    │
            │  (consumes JSONL)│
            └──────────────────┘
```

## Future Environments

These scripts can be deployed to any environment that:
1. Has Node.js installed
2. Can execute TypeScript (via tsx or pre-compiled)
3. Can capture stdout
4. Has network access for API calls

Potential deployment targets:
- **Modal sandboxes** (current)
- **Docker containers**
- **AWS Lambda** (with container runtime)
- **Kubernetes pods**
- **Local subprocesses**

## Related Packages

- [@hhopkins/agent-server](./agent-server.md) - Orchestrates execution and consumes output
- [@hhopkins/agent-converters](./agent-converters.md) - Provides output normalization

## License

MIT
