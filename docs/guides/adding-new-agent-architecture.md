# Adding a New Agent Architecture

Integrate a new AI SDK (like Gemini, GPT, etc.) into the agent system.

## Prerequisites

- Familiarity with the target AI SDK
- Understanding of [Architecture Overview](../system/architecture-overview.md)
- Working development environment

## Steps

### 1. Add Converter

Create a new adapter in `packages/converters/src/`:

```typescript
// packages/converters/src/my-sdk/index.ts

import { ConversationBlock } from '@ai-systems/shared-types';

export function parseMySDKTranscript(content: string): ConversationBlock[] {
  const parsed = JSON.parse(content);
  return convertToBlocks(parsed);
}

function convertToBlocks(data: unknown): ConversationBlock[] {
  // Transform SDK-specific format to ConversationBlocks
  const blocks: ConversationBlock[] = [];

  // Map messages to blocks
  for (const msg of data.messages) {
    if (msg.role === 'user') {
      blocks.push({
        type: 'user_message',
        content: msg.content,
        timestamp: msg.timestamp,
      });
    } else if (msg.role === 'assistant') {
      blocks.push({
        type: 'assistant_text',
        content: msg.content,
        timestamp: msg.timestamp,
      });
    }
    // Handle tool calls, etc.
  }

  return blocks;
}
```

Export from the package:

```typescript
// packages/converters/src/index.ts
export * from './my-sdk';
```

### 2. Add Runner Adapter

Create execution adapter in `runtime/runner/src/adapters/`:

```typescript
// runtime/runner/src/adapters/my-sdk.ts

import { MySdkClient } from 'my-sdk';
import { StreamEvent } from '@ai-systems/shared-types';

export async function* executeMySDKQuery(args: {
  query: string;
  sessionId: string;
  projectDir: string;
  model?: string;
}): AsyncGenerator<StreamEvent> {
  const client = new MySdkClient({
    apiKey: process.env.MY_SDK_API_KEY,
  });

  const stream = await client.chat({
    model: args.model || 'default-model',
    messages: [{ role: 'user', content: args.query }],
    stream: true,
  });

  for await (const chunk of stream) {
    yield {
      type: 'text_delta',
      delta: chunk.text,
    };
  }

  yield {
    type: 'message_complete',
    content: stream.finalMessage,
  };
}
```

### 3. Register Architecture

Add to the architecture registry:

```typescript
// packages/types/src/architectures.ts

export type AgentArchitecture =
  | 'claude-sdk'
  | 'opencode'
  | 'my-sdk';  // Add here
```

Update the runner's CLI:

```typescript
// runtime/runner/src/cli/execute-query.ts

import { executeMySDKQuery } from '../adapters/my-sdk';

switch (architecture) {
  case 'claude-sdk':
    yield* executeClaudeQuery(args);
    break;
  case 'opencode':
    yield* executeOpenCodeQuery(args);
    break;
  case 'my-sdk':
    yield* executeMySDKQuery(args);
    break;
}
```

### 4. Test the Integration

Create tests in `packages/converters/__tests__/`:

```typescript
// packages/converters/__tests__/my-sdk.test.ts

import { parseMySDKTranscript } from '../src/my-sdk';

describe('My SDK Converter', () => {
  it('parses user messages', () => {
    const transcript = JSON.stringify({
      messages: [{ role: 'user', content: 'Hello' }],
    });

    const blocks = parseMySDKTranscript(transcript);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('user_message');
    expect(blocks[0].content).toBe('Hello');
  });

  it('parses assistant messages', () => {
    const transcript = JSON.stringify({
      messages: [{ role: 'assistant', content: 'Hi there!' }],
    });

    const blocks = parseMySDKTranscript(transcript);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('assistant_text');
  });
});
```

## Verification

```bash
# Build all packages
pnpm build

# Run converter tests
cd packages/converters && pnpm test

# Test end-to-end (requires API key)
cd runtime/runner
node dist/runner.js execute-query "Hello" \
  --architecture my-sdk \
  --session-id test
```

Expected output:
```json
{"type":"text_delta","delta":"Hello"}
{"type":"text_delta","delta":"! How"}
{"type":"message_complete","content":"Hello! How can I help?"}
```

## Common Issues

### Missing Type Exports

**Symptom:** TypeScript errors about unknown architecture
**Cause:** Type not added to `AgentArchitecture` union
**Fix:** Update `packages/types/src/architectures.ts`

### Stream Events Not Flowing

**Symptom:** No output from runner
**Cause:** Generator not yielding correctly
**Fix:** Ensure `yield*` is used for nested generators

### API Key Not Found

**Symptom:** Authentication errors
**Cause:** Environment variable not set in sandbox
**Fix:** Pass via `ExecutionEnvironment` configuration

## Next Steps

- [agent-runner](../packages/agent-runner.md) - Runner internals
- [agent-converters](../packages/agent-converters.md) - Converter patterns
- [Streaming and Events](../system/streaming-and-events.md) - Event types
