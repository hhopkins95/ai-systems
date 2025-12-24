---
title: Architecture Plan
created: 2025-12-10
---

# Architecture Plan

## Current Architecture

```
CLI Command Handler
├── readStdinJson<T>()           # Reads all stdin, parses JSON
├── [All business logic]         # SDK calls, conversions, etc.
└── writeStreamEvent()           # Writes JSONL to stdout
```

Every command is a monolithic function that handles I/O and logic together.

## Proposed Architecture

```
CLI Layer (thin)                    Core Functions (pure)              SDK Clients
├── Read stdin                      ├── AsyncGenerator<StreamEvent>    ├── Lazy initialization
├── Parse JSON                      ├── Typed input parameters         ├── Singleton pattern
├── Call core function              ├── Optional message channel       └── Reusable across calls
├── Iterate generator               └── No I/O dependencies
└── Write to stdout
```

## Directory Structure

```
runtime/runner/src/
├── core/                              # Pure business logic (NEW)
│   ├── index.ts                       # Re-exports
│   ├── execute-query.ts               # Dispatcher to claude/opencode
│   ├── execute-claude-query.ts        # Claude Agent SDK integration
│   ├── execute-opencode-query.ts      # OpenCode SDK integration
│   ├── load-agent-profile.ts          # Profile loading logic
│   ├── load-session-transcript.ts     # Transcript loading logic
│   └── read-session-transcript.ts     # Transcript reading logic
│
├── clients/                           # SDK client management (NEW)
│   ├── index.ts                       # Re-exports
│   ├── claude.ts                      # getClaudeQuery() - lazy init
│   ├── opencode.ts                    # getOpencodeClient() - lazy init
│   └── channel.ts                     # Message channel utility
│
├── cli/                               # Refactored CLI layer
│   ├── index.ts                       # Commander entry point (was runner.ts)
│   ├── commands/                      # One file per command
│   │   ├── execute-query.ts
│   │   ├── load-agent-profile.ts
│   │   ├── load-session-transcript.ts
│   │   └── read-session-transcript.ts
│   └── io/                            # I/O utilities (was shared/)
│       ├── input.ts                   # Stdin reading
│       ├── output.ts                  # Stdout writing
│       └── stream.ts                  # Stream utilities
│
├── types.ts                           # Shared types
├── index.ts                           # Package exports
│
└── test-harness/                      # Unchanged (E2E testing)
    └── ...
```

## Core Function Signatures

All core functions follow this pattern:

```typescript
export async function* executeQuery(
  input: QueryInput,
  messages?: AsyncIterable<UserMessage>
): AsyncGenerator<StreamEvent> {
  // Implementation
}
```

### Execute Query (Dispatcher)

```typescript
// core/execute-query.ts
import { executeClaudeQuery } from './execute-claude-query';
import { executeOpencodeQuery } from './execute-opencode-query';

export async function* executeQuery(
  input: QueryInput,
  messages: AsyncIterable<UserMessage> = emptyAsyncIterable()
): AsyncGenerator<StreamEvent> {
  if (input.architecture === 'opencode') {
    yield* executeOpencodeQuery(input, messages);
  } else {
    yield* executeClaudeQuery(input, messages);
  }
}
```

### Claude SDK Integration

```typescript
// core/execute-claude-query.ts
import { query } from '@anthropic-ai/claude-agent-sdk';
import { convertClaudeMessage } from '@ai-systems/state/claude-sdk';

export async function* executeClaudeQuery(
  input: QueryInput,
  messages: AsyncIterable<UserMessage> = emptyAsyncIterable()
): AsyncGenerator<StreamEvent> {

  // Create message generator for SDK streaming input mode
  async function* generateMessages() {
    // Initial message
    yield {
      type: 'user' as const,
      message: { role: 'user' as const, content: input.prompt }
    };

    // Additional messages from channel (if any)
    for await (const msg of messages) {
      yield { type: 'user' as const, message: msg };
    }
  }

  const result = query({
    prompt: generateMessages(),
    options: {
      model: input.model,
      resume: input.sessionId,
      cwd: input.cwd,
      mcpServers: input.mcpServers,
      allowedTools: input.tools,
      permissionMode: 'bypassPermissions',
      // ...
    }
  });

  for await (const message of result) {
    yield* convertClaudeMessage(message);
  }
}
```

### OpenCode SDK Integration

```typescript
// core/execute-opencode-query.ts
import { getOpencodeClient } from '../clients/opencode';
import { convertOpencodeEvent } from '@ai-systems/state/opencode';

export async function* executeOpencodeQuery(
  input: QueryInput,
  messages: AsyncIterable<UserMessage> = emptyAsyncIterable()
): AsyncGenerator<StreamEvent> {
  const client = await getOpencodeClient();

  // Create or resume session
  const session = input.sessionId
    ? await client.session.get({ path: { id: input.sessionId } })
    : await client.session.create();

  // Send initial prompt
  const response = await client.session.prompt({
    path: { id: session.data.id },
    body: { parts: [{ type: 'text', text: input.prompt }] }
  });

  // Stream events
  const events = await client.event.subscribe();
  for await (const event of events.events) {
    yield* convertOpencodeEvent(event);
  }

  // Handle additional messages
  for await (const msg of messages) {
    await client.session.prompt({
      path: { id: session.data.id },
      body: { parts: [{ type: 'text', text: msg.content }] }
    });
  }
}
```

## Client Management

### Lazy Initialization Pattern

```typescript
// clients/opencode.ts
import { createOpencode, type OpencodeClient } from '@opencode-ai/sdk';

let clientPromise: Promise<OpencodeClient> | null = null;

export async function getOpencodeClient(): Promise<OpencodeClient> {
  if (!clientPromise) {
    clientPromise = createOpencode({
      hostname: '127.0.0.1',
      port: 4096,
      timeout: 5000
    }).then(({ client }) => client);
  }
  return clientPromise;
}

export function resetOpencodeClient(): void {
  clientPromise = null;
}
```

### Message Channel

```typescript
// clients/channel.ts
export interface MessageChannel<T> {
  send(value: T): void;
  close(): void;
  receive(): AsyncGenerator<T>;
}

export function createMessageChannel<T>(): MessageChannel<T> {
  const queue: T[] = [];
  const waiters: Array<(result: IteratorResult<T>) => void> = [];
  let closed = false;

  return {
    send(value: T) {
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

    async *receive(): AsyncGenerator<T> {
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

## CLI Layer

### Command Implementation

```typescript
// cli/commands/execute-query.ts
import { Command } from 'commander';
import { executeQuery } from '../../core';
import { readStdinJson } from '../io/input';
import { writeStreamEvent, writeError } from '../io/output';
import { setupSignalHandlers } from '../io/signal-handlers';
import type { QueryInput } from '../../types';

export const executeQueryCommand = new Command('execute-query')
  .description('Execute an agent query')
  .action(async () => {
    setupSignalHandlers();

    try {
      const input = await readStdinJson<QueryInput>();

      for await (const event of executeQuery(input)) {
        writeStreamEvent(event);
      }

      process.exit(0);
    } catch (error) {
      writeError(error);
      process.exit(1);
    }
  });
```

### Streaming Input Mode (Optional)

```typescript
// cli/commands/execute-query.ts (with streaming support)
import { createMessageChannel } from '../../clients/channel';
import { readFirstJsonLine, readJsonLines } from '../io/input';

export const executeQueryCommand = new Command('execute-query')
  .description('Execute an agent query')
  .action(async () => {
    setupSignalHandlers();

    try {
      const input = await readFirstJsonLine<QueryInput>();

      if (input.streamingInput) {
        // Streaming mode: create channel, feed from stdin
        const channel = createMessageChannel<UserMessage>();

        // Background: read subsequent lines into channel
        (async () => {
          for await (const msg of readJsonLines<UserMessage>()) {
            channel.send(msg);
          }
          channel.close();
        })();

        for await (const event of executeQuery(input, channel.receive())) {
          writeStreamEvent(event);
        }
      } else {
        // Single message mode
        for await (const event of executeQuery(input)) {
          writeStreamEvent(event);
        }
      }

      process.exit(0);
    } catch (error) {
      writeError(error);
      process.exit(1);
    }
  });
```

## Testing Strategy

### Unit Tests (New)

```typescript
// __tests__/core/execute-query.test.ts
import { executeQuery } from '../../src/core';

describe('executeQuery', () => {
  it('yields stream events for claude-sdk architecture', async () => {
    const input = {
      prompt: 'What is 2 + 2?',
      architecture: 'claude-sdk',
      model: 'claude-sonnet-4',
      cwd: '/tmp/test'
    };

    const events: StreamEvent[] = [];
    for await (const event of executeQuery(input)) {
      events.push(event);
    }

    expect(events.length).toBeGreaterThan(0);
    expect(events.some(e => e.type === 'result')).toBe(true);
  });

  it('handles streaming input via channel', async () => {
    const channel = createMessageChannel<UserMessage>();
    const input = { prompt: 'Hello', architecture: 'claude-sdk', ... };

    const execution = executeQuery(input, channel.receive());

    // Send follow-up after delay
    setTimeout(() => {
      channel.send({ role: 'user', content: 'Follow up' });
      channel.close();
    }, 1000);

    const events: StreamEvent[] = [];
    for await (const event of execution) {
      events.push(event);
    }

    // Verify multi-turn conversation
    expect(events).toContainEqual(expect.objectContaining({ ... }));
  });
});
```

### E2E Tests (Existing)

The test harness continues to work unchanged:

```bash
harness execute-query -p "What is 2+2?" --format summary
```

## Migration Path

1. Create new `core/` and `clients/` directories
2. Extract logic from existing CLI handlers into core functions
3. Refactor CLI handlers to be thin wrappers
4. Add unit tests for core functions
5. Verify test harness still works
6. Update package exports

## Package Exports

```typescript
// index.ts
export * from './core';
export * from './clients';
export * from './types';
export { BUNDLE_PATH, BUNDLE_CONTENT } from './bundle';
```

This allows direct imports:

```typescript
import { executeQuery, createMessageChannel } from '@hhopkins/agent-runner';
```
