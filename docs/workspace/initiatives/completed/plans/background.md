---
title: Technical Background
created: 2025-12-10
---

# Technical Background

Research and patterns discovered during initiative planning.

## Claude Agent SDK

### Streaming Input Mode (Recommended)

The Claude Agent SDK supports two input modes. **Streaming input is recommended** as it provides full access to the agent's capabilities.

From the [official docs](https://platform.claude.com/docs/en/agent-sdk/streaming-vs-single-mode):

> Streaming input mode is the **preferred** way to use the Claude Agent SDK. It provides full access to the agent's capabilities and enables rich, interactive experiences.

### How Streaming Input Works

The `query()` function accepts either a string or an `AsyncIterable`:

```typescript
function query({
  prompt,
  options
}: {
  prompt: string | AsyncIterable<SDKUserMessage>;
  options?: Options;
}): Query
```

When using an `AsyncIterable`, the SDK operates as a long-lived process that:
- Accepts messages as they're yielded
- Handles interruptions
- Surfaces permission requests
- Manages session state

### Benefits of Streaming Mode

- **Image uploads**: Attach images directly to messages
- **Queued messages**: Send multiple messages that process sequentially
- **Tool integration**: Full access to all tools and MCP servers
- **Hooks support**: Lifecycle hooks work properly
- **Real-time feedback**: See responses as they're generated
- **Context persistence**: Natural multi-turn conversations

### Example Pattern

```typescript
async function* generateMessages() {
  // First message
  yield {
    type: "user" as const,
    message: {
      role: "user" as const,
      content: "Analyze this codebase for security issues"
    }
  };

  // Can yield more messages later
  await someCondition();

  yield {
    type: "user" as const,
    message: {
      role: "user" as const,
      content: [
        { type: "text", text: "Review this diagram" },
        { type: "image", source: { type: "base64", ... } }
      ]
    }
  };
}

for await (const message of query({
  prompt: generateMessages(),
  options: { maxTurns: 10 }
})) {
  // Handle streaming responses
}
```

### Key Types

```typescript
type SDKMessage =
  | SDKAssistantMessage    // Assistant response
  | SDKUserMessage         // User input
  | SDKResultMessage       // Final result (success or error)
  | SDKSystemMessage       // System init message
  | SDKPartialAssistantMessage  // Streaming partial

type SDKResultMessage = {
  type: 'result';
  subtype: 'success' | 'error_max_turns' | 'error_during_execution' | ...;
  session_id: string;
  duration_ms: number;
  total_cost_usd: number;
  result?: string;
  errors?: string[];
  // ...
}
```

### Session Management

The SDK has built-in session management:

```typescript
options: {
  resume: 'session-id',      // Resume existing session
  forkSession: true,         // Fork to new session ID when resuming
  continue: true,            // Continue most recent conversation
}
```

---

## OpenCode SDK

### Package Overview

| Package | Purpose |
|---------|---------|
| `@opencode-ai/sdk` | Client SDK for interacting with OpenCode server |
| `@opencode-ai/plugin` | Plugin system for creating custom tools |

### Client Initialization

```typescript
import { createOpencode, createOpencodeClient } from "@opencode-ai/sdk";

// Create both client and server
const { client, server } = await createOpencode({
  hostname: "127.0.0.1",
  port: 4096,
  timeout: 5000
});

// Or just the client (assumes server already running)
const client = createOpencodeClient({
  baseUrl: "http://127.0.0.1:4096"
});
```

### Client API

| Category | Methods |
|----------|---------|
| `client.session` | list, create, get, delete, prompt, messages, fork, share |
| `client.project` | list, current |
| `client.file` | list, read, status |
| `client.find` | text, files, symbols |
| `client.tool` | ids, list |
| `client.event` | subscribe (SSE streaming) |

### Event Streaming

```typescript
const result = await client.event.subscribe();

for await (const event of result.events) {
  console.log("Event:", event.type, event.data);
}
```

### Custom Tools

Tools are TypeScript files in `.opencode/tool/`:

```typescript
import { tool } from "@opencode-ai/plugin";

export default tool({
  description: "Brief description",
  args: {
    param: tool.schema.string().describe("Parameter description")
  },
  async execute(args, context) {
    return "Result string";
  }
});
```

---

## Current Runner Architecture

### Package Info

- **Name**: `@hhopkins/agent-runner`
- **Binary**: `runner`
- **Location**: `runtime/runner/`

### Commands

| Command | Purpose |
|---------|---------|
| `runner execute-query` | Execute agent queries |
| `runner load-agent-profile` | Load agent profiles |
| `runner load-session-transcript` | Load session transcripts |
| `runner read-session-transcript` | Read session transcripts |

### Current I/O Pattern

**Input** (`src/cli/shared/input.ts`):
```typescript
export async function readStdinJson<T>(): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks).toString('utf-8');
  return JSON.parse(input) as T;
}
```

**Output** (`src/cli/shared/output.ts`):
```typescript
function writeStreamEvent(event: StreamEvent): void {
  process.stdout.write(JSON.stringify(event) + '\n');
}

function writeError(error: Error | string): void {
  // Creates SystemBlock with type: 'system', subtype: 'error'
  // Outputs as StreamEvent
}
```

### Architecture Support

The runner supports two architectures:

1. **Claude SDK** (`claude-sdk`):
   - Uses `@anthropic-ai/claude-agent-sdk`
   - Session management via `~/.claude/projects/`
   - Output converted via `@ai-systems/state/claude-sdk`

2. **OpenCode** (`opencode`):
   - Uses `@opencode-ai/sdk`
   - Requires `OPENCODE_API_KEY`
   - Output converted via `@ai-systems/state/opencode`

### Test Harness

Located at `src/test-harness/`, provides:

- **Process spawning**: `process-runner.ts` spawns `node dist/runner.js`
- **Stream parsing**: `stream-parser.ts` parses JSONL output
- **Workspace management**: Creates temp directories for tests
- **Input resolution**: Supports file, inline JSON, or stdin

Commands:
```bash
harness execute-query -p "prompt" --format summary
harness workflow --agent profile.json -p "prompt"
```

---

## Async Generator Patterns

### Basic Pattern

```typescript
async function* myGenerator(): AsyncGenerator<Event> {
  yield { type: 'start' };

  const data = await fetchData();
  yield { type: 'data', data };

  yield { type: 'end' };
}

// Consumption
for await (const event of myGenerator()) {
  console.log(event);
}
```

### Delegation with `yield*`

```typescript
async function* outer(): AsyncGenerator<Event> {
  yield { type: 'outer-start' };
  yield* inner();  // Delegates to inner generator
  yield { type: 'outer-end' };
}

async function* inner(): AsyncGenerator<Event> {
  yield { type: 'inner-1' };
  yield { type: 'inner-2' };
}
```

### Composition

```typescript
async function* transform<T, U>(
  source: AsyncIterable<T>,
  fn: (item: T) => U
): AsyncGenerator<U> {
  for await (const item of source) {
    yield fn(item);
  }
}
```

---

## Message Channel Pattern

A push-based async iterable that allows external code to inject values:

```typescript
interface MessageChannel<T> {
  send(value: T): void;    // Push value (non-blocking)
  close(): void;           // Signal end of stream
  receive(): AsyncGenerator<T>;  // Pull values
}
```

This bridges the gap between:
- **Push-based** producers (CLI reading stdin, tests injecting values)
- **Pull-based** consumers (SDK's async generator)

### Implementation

```typescript
function createMessageChannel<T>(): MessageChannel<T> {
  const queue: T[] = [];
  const waiters: Array<(result: IteratorResult<T>) => void> = [];
  let closed = false;

  return {
    send(value) {
      if (closed) return;
      if (waiters.length > 0) {
        waiters.shift()!({ value, done: false });
      } else {
        queue.push(value);
      }
    },

    close() {
      closed = true;
      while (waiters.length) {
        waiters.shift()!({ value: undefined as any, done: true });
      }
    },

    async *receive() {
      while (true) {
        if (queue.length > 0) {
          yield queue.shift()!;
        } else if (closed) {
          return;
        } else {
          const result = await new Promise<IteratorResult<T>>(
            resolve => waiters.push(resolve)
          );
          if (result.done) return;
          yield result.value;
        }
      }
    }
  };
}
```

### Usage

```typescript
const channel = createMessageChannel<string>();

// Consumer (doesn't know where messages come from)
(async () => {
  for await (const msg of channel.receive()) {
    console.log('Received:', msg);
  }
  console.log('Channel closed');
})();

// Producer (can push anytime)
channel.send('hello');
setTimeout(() => channel.send('world'), 1000);
setTimeout(() => channel.close(), 2000);
```

---

## Key Design Decisions

### 1. Streaming Mode Internally

Even for single-prompt execution, use the SDK's streaming input mode:

```typescript
async function* singleMessage(prompt: string) {
  yield { type: 'user', message: { role: 'user', content: prompt } };
}

query({ prompt: singleMessage(input.prompt), options: {...} });
```

This ensures consistent behavior and access to full SDK features.

### 2. Optional Message Channel

Core functions accept `AsyncIterable<UserMessage>` but default to empty:

```typescript
async function* executeQuery(
  input: QueryInput,
  messages: AsyncIterable<UserMessage> = emptyAsyncIterable()
)
```

Simple callers don't need to think about channels. Advanced callers can pass one.

### 3. Lazy Client Initialization

Clients are created on first use, not at module load:

```typescript
let clientPromise: Promise<Client> | null = null;

function getClient() {
  if (!clientPromise) {
    clientPromise = createClient();
  }
  return clientPromise;
}
```

Benefits:
- No startup cost if client isn't used
- Client reused across calls
- Easy to reset for testing

### 4. Thin CLI Layer

CLI handlers should be ~20 lines:

```typescript
async function main() {
  const input = await readStdinJson<QueryInput>();
  for await (const event of executeQuery(input)) {
    writeStreamEvent(event);
  }
}
```

All business logic lives in core functions.
