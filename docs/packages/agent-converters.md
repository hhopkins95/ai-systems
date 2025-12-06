---
title: "@hhopkins/agent-converters"
description: Pure transformation functions for parsing agent transcripts and converting to normalized blocks
---

# @hhopkins/agent-converters

Pure transformation functions for parsing agent transcripts and converting SDK-specific messages to architecture-agnostic ConversationBlocks and StreamEvents.

## Features

- **Pure Functions** - No side effects, easy to test and compose
- **Multi-SDK Support** - Claude SDK and OpenCode converters
- **Type Re-exports** - All block types from `@ai-systems/shared-types`
- **Type Guards** - Runtime type checking for blocks and events
- **Utilities** - ID generation, timestamps, logging interfaces

## Installation

```bash
npm install @hhopkins/agent-converters
# or
pnpm add @hhopkins/agent-converters
```

## Quick Start

```typescript
import { claudeSdk, opencode } from '@hhopkins/agent-converters';

// Parse a Claude SDK transcript file
const blocks = claudeSdk.parseClaudeTranscriptFile(transcriptContent);

// Parse an OpenCode transcript file
const { blocks, subagents } = opencode.parseOpenCodeTranscriptFile(transcriptContent);
```

## Claude SDK Converters

Import via the `claudeSdk` namespace:

```typescript
import { claudeSdk } from '@hhopkins/agent-converters';
```

### `parseClaudeTranscriptFile(content, options?)`

Parse a Claude SDK JSONL transcript file into ConversationBlocks.

```typescript
const blocks = claudeSdk.parseClaudeTranscriptFile(rawTranscript, {
  sessionId: 'session-123',
  logger: console,
});
```

### `convertMessagesToBlocks(messages, options?)`

Convert an array of SDK messages to ConversationBlocks.

```typescript
const blocks = claudeSdk.convertMessagesToBlocks(sdkMessages, {
  sessionId: 'session-123',
});
```

### `parseStreamEvent(line, options?)`

Parse a single JSONL line into a StreamEvent.

```typescript
const event = claudeSdk.parseStreamEvent(jsonLine, { sessionId: 'session-123' });
```

### Other Exports

- `extractSubagentId(toolUse)` - Extract subagent ID from a tool use block
- `detectSubagentStatus(blocks)` - Detect if a subagent is running/complete
- `sdkMessageToBlocks(message)` - Convert a single SDK message
- `sdkMessagesToBlocks(messages)` - Convert multiple SDK messages
- `extractToolResultBlocks(message)` - Extract tool results from a message
- `createSubagentBlockFromToolUse(toolUse)` - Create a subagent block

## OpenCode Converters

Import via the `opencode` namespace:

```typescript
import { opencode } from '@hhopkins/agent-converters';
```

### `parseOpenCodeTranscriptFile(content, options?)`

Parse an OpenCode JSON transcript file.

```typescript
const { blocks, subagents } = opencode.parseOpenCodeTranscriptFile(rawTranscript, {
  sessionId: 'session-123',
  logger: console,
});
```

### `createStreamEventParser(sessionId)`

Create a stateful stream event parser for real-time parsing.

```typescript
const parser = opencode.createStreamEventParser('session-123');

for (const line of streamLines) {
  const events = parser.parse(line);
  for (const event of events) {
    handleEvent(event);
  }
}
```

### `parseOpencodeStreamEvent(event, options?)`

Parse a single OpenCode stream event.

```typescript
const streamEvent = opencode.parseOpencodeStreamEvent(rawEvent, {
  sessionId: 'session-123',
});
```

## Type Re-exports

All block and event types are re-exported from `@ai-systems/shared-types`:

```typescript
import type {
  ConversationBlock,
  UserMessageBlock,
  AssistantTextBlock,
  ToolUseBlock,
  ToolResultBlock,
  ThinkingBlock,
  SystemBlock,
  SubagentBlock,
  ErrorBlock,
  StreamEvent,
  BlockStartEvent,
  TextDeltaEvent,
  BlockCompleteEvent,
} from '@hhopkins/agent-converters';
```

## Type Guards

```typescript
import {
  isUserMessageBlock,
  isAssistantTextBlock,
  isToolUseBlock,
  isToolResultBlock,
  isThinkingBlock,
  isSystemBlock,
  isSubagentBlock,
  isErrorBlock,
  isBlockStartEvent,
  isTextDeltaEvent,
  isBlockCompleteEvent,
} from '@hhopkins/agent-converters';

if (isAssistantTextBlock(block)) {
  console.log(block.content);
}
```

## Utilities

```typescript
import {
  generateId,
  toISOTimestamp,
  createConsoleLogger,
  noopLogger,
  type Logger,
} from '@hhopkins/agent-converters';

// Generate a unique block ID
const id = generateId(); // "blk_abc123..."

// Convert Date to ISO string
const timestamp = toISOTimestamp(new Date());

// Create a logger
const logger = createConsoleLogger('MyModule');
logger.info('Processing transcript');
```

## Related Packages

- [@hhopkins/agent-server](./agent-server.md) - Uses converters for transcript parsing
- [@hhopkins/agent-execution](./agent-execution.md) - Uses converters for output normalization
- [@ai-systems/shared-types](https://github.com/hhopkins/ai-systems/tree/main/packages/shared-types) - Source of block/event types

## License

MIT
