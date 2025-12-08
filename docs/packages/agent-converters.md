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
// Import from subpaths
import { parseClaudeTranscriptFile } from '@hhopkins/agent-converters/claude-sdk';
import { parseOpenCodeTranscriptFile } from '@hhopkins/agent-converters/opencode';

// Parse a Claude SDK transcript file
const blocks = parseClaudeTranscriptFile(transcriptContent);

// Parse an OpenCode transcript file
const { blocks, subagents } = parseOpenCodeTranscriptFile(transcriptContent);
```

## Claude SDK Converters

Import from the `/claude-sdk` subpath:

```typescript
import {
  parseClaudeTranscriptFile,
  parseCombinedClaudeTranscript,
  convertMessagesToBlocks,
  parseStreamEvent,
} from '@hhopkins/agent-converters/claude-sdk';
```

### `parseClaudeTranscriptFile(content, options?)`

Parse a Claude SDK JSONL transcript file into SDK messages.

```typescript
const messages = parseClaudeTranscriptFile(rawTranscript, {
  logger: console,
});
```

### `parseCombinedClaudeTranscript(content, options?)`

Parse a combined transcript (main + subagents) into ConversationBlocks.

```typescript
const { blocks, subagents } = parseCombinedClaudeTranscript(combinedTranscript, {
  logger: console,
});
```

### `convertMessagesToBlocks(messages, options?)`

Convert an array of SDK messages to ConversationBlocks.

```typescript
const blocks = convertMessagesToBlocks(sdkMessages, {
  logger: console,
});
```

### `parseStreamEvent(message, options?)`

Parse an SDK message into StreamEvents.

```typescript
const events = parseStreamEvent(sdkMessage, { logger: console });
```

### Other Exports

- `extractSubagentId(filename)` - Extract subagent ID from a filename
- `detectSubagentStatus(messages)` - Detect if a subagent is running/complete
- `sdkMessageToBlocks(message)` - Convert a single SDK message
- `sdkMessagesToBlocks(messages)` - Convert multiple SDK messages
- `extractToolResultBlocks(message)` - Extract tool results from a message
- `createSubagentBlockFromToolUse(toolUse)` - Create a subagent block

## OpenCode Converters

Import from the `/opencode` subpath:

```typescript
import {
  parseOpenCodeTranscriptFile,
  createStreamEventParser,
  parseOpencodeStreamEvent,
} from '@hhopkins/agent-converters/opencode';
```

### `parseOpenCodeTranscriptFile(content, options?)`

Parse an OpenCode JSON transcript file.

```typescript
const { blocks, subagents } = parseOpenCodeTranscriptFile(rawTranscript, {
  logger: console,
});
```

### `createStreamEventParser(sessionId, options?)`

Create a stateful stream event parser for real-time parsing.

```typescript
const parser = createStreamEventParser('session-123');

for await (const event of eventStream) {
  const streamEvents = parser.parseEvent(event);
  for (const streamEvent of streamEvents) {
    handleEvent(streamEvent);
  }
}
```

### `parseOpencodeStreamEvent(event, sessionId, options?)`

Parse a single OpenCode stream event (stateless).

```typescript
const streamEvents = parseOpencodeStreamEvent(rawEvent, 'session-123', {
  logger: console,
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
