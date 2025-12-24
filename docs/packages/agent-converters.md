# agent-converters

Transformation functions for parsing agent transcripts and converting streaming SDK events to SessionEvents.

## What It Does

- Parses raw transcripts from Claude SDK and OpenCode SDK
- Converts streaming SDK events to unified SessionEvents
- Transforms SDK-specific formats to ConversationBlocks
- Provides type guards for runtime type checking
- Handles subagent transcript extraction

## Architecture

```mermaid
flowchart LR
    subgraph agent-converters
        Main[Main Exports]
        Claude[claude-sdk/]
        OpenCode[opencode/]
    end

    RawTranscript[Raw Transcript] --> Main
    StreamEvents[SDK Events] --> Main
    Main --> Claude
    Main --> OpenCode
    Claude --> Blocks[ConversationBlock[]]
    Claude --> Events[SessionEvent[]]
    OpenCode --> Blocks
    OpenCode --> Events
```

## Core Components

| Component | File | Purpose |
|-----------|------|---------|
| Claude Parser | `src/claude-sdk/` | Parse Claude SDK transcripts |
| OpenCode Parser | `src/opencode/` | Parse OpenCode transcripts |
| OpenCode Converter | `src/opencode/block-converter.ts` | Convert streaming events |
| Session Reducer | `src/session-state/` | Reduce events to state |
| Type Guards | `src/index.ts` | Runtime type checking |
| Utilities | `src/utils.ts` | ID generation, timestamps |

## Usage

### Transcript Parsing (Loading Saved Sessions)

```typescript
import { parseClaudeTranscriptFile } from '@hhopkins/agent-converters/claude-sdk';
import { parseOpenCodeTranscriptFile } from '@hhopkins/agent-converters/opencode';

// Parse Claude SDK transcript
const blocks = parseClaudeTranscriptFile(rawTranscript);

// Parse OpenCode transcript
const state = parseOpenCodeTranscriptFile(rawTranscript);
console.log(state.blocks, state.subagents);
```

### Streaming Event Conversion (Live Sessions)

```typescript
import { createOpenCodeEventConverter } from '@hhopkins/agent-converters/opencode';
import { reduceSessionEvent, createInitialConversationState } from '@hhopkins/agent-converters';

// Create stateful converter for a session
const converter = createOpenCodeEventConverter(mainSessionId);
let state = createInitialConversationState();

// Process streaming events from OpenCode SDK
for await (const event of opencodeSseStream) {
  const sessionEvents = converter.parseEvent(event);

  for (const sessionEvent of sessionEvents) {
    state = reduceSessionEvent(state, sessionEvent);
  }
}

// Reset converter between sessions
converter.reset();
```

### Type Guards

```typescript
import { isAssistantTextBlock, isToolUseBlock } from '@hhopkins/agent-converters';

if (isAssistantTextBlock(block)) {
  console.log(block.content);
}
```

## OpenCode Event Converter

The `createOpenCodeEventConverter()` factory creates a stateful converter that:

1. **Correlates message roles with parts** - Tracks `messageId → role` to correctly identify user vs assistant content
2. **Emits efficient events** - Only `block:upsert` once per part, then `block:delta` for streaming updates
3. **Manages lifecycle** - Clears part tracking on `session.idle`, preserves message roles across turns

```typescript
interface OpenCodeEventConverter {
  parseEvent(event: Event): AnySessionEvent[];
  reset(): void;
}
```

### Event Mapping

| OpenCode Event | SessionEvent Output |
|----------------|---------------------|
| `message.updated` | Stores role, emits `metadata:update` if tokens/cost |
| `message.part.updated` (text, user) | `block:upsert` → `user_message` |
| `message.part.updated` (text, assistant) | `block:upsert` + `block:delta` → `assistant_text` |
| `message.part.updated` (tool) | `block:upsert` → `tool_use` + `tool_result` |
| `message.part.updated` (task) | `subagent:spawned` / `subagent:completed` |
| `session.idle` | `session:idle` (finalizes pending blocks) |

## Key Types

```typescript
// Re-exported from shared-types
type ConversationBlock =
  | UserMessageBlock
  | AssistantTextBlock
  | ToolUseBlock
  | ToolResultBlock
  | ThinkingBlock
  | SystemBlock
  | SubagentBlock;

// Transcript parsing
function parseClaudeTranscriptFile(content: string): ConversationBlock[];
function parseOpenCodeTranscriptFile(content: string): SessionConversationState;

// Streaming conversion (stateful)
function createOpenCodeEventConverter(
  mainSessionId: string,
  options?: ConvertOptions
): OpenCodeEventConverter;
```

## How It Connects

| Direction | Package | Relationship |
|-----------|---------|--------------|
| Depends on | shared-types | Block/event definitions |
| Peer dep | @anthropic-ai/claude-agent-sdk | Optional |
| Peer dep | @opencode-ai/sdk | Optional |
| Used by | agent-runner | Transcript parsing, streaming |
| Used by | agent-server | Block conversion |

## Related

- [Session Events and State](../system/session-events-and-state/index.md) - Event types and reducer
- [agent-runner](./agent-runner.md) - Uses converters
- [shared-types](./shared-types.md) - Type definitions
