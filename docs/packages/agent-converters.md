# agent-converters

Pure transformation functions for parsing agent transcripts and converting to ConversationBlocks.

## What It Does

- Parses raw transcripts from Claude SDK and OpenCode SDK
- Converts SDK-specific formats to unified ConversationBlocks
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
    Main --> Claude
    Main --> OpenCode
    Claude --> Blocks[ConversationBlock[]]
    OpenCode --> Blocks
```

## Core Components

| Component | File | Purpose |
|-----------|------|---------|
| Claude Parser | `src/claude-sdk/` | Parse Claude SDK transcripts |
| OpenCode Parser | `src/opencode/` | Parse OpenCode transcripts |
| Type Guards | `src/index.ts` | Runtime type checking |
| Utilities | `src/utils.ts` | ID generation, timestamps |

## Usage

```typescript
// Import from subpaths
import { parseClaudeTranscriptFile } from '@hhopkins/agent-converters/claude-sdk';
import { parseOpenCodeTranscriptFile } from '@hhopkins/agent-converters/opencode';

// Parse Claude SDK transcript
const blocks = parseClaudeTranscriptFile(rawTranscript);

// Parse OpenCode transcript
const { blocks, subagents } = parseOpenCodeTranscriptFile(rawTranscript);

// Use type guards
import { isAssistantTextBlock, isToolUseBlock } from '@hhopkins/agent-converters';

if (isAssistantTextBlock(block)) {
  console.log(block.content);
}
```

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

// Parsing functions
function parseClaudeTranscriptFile(content: string): ConversationBlock[];
function parseOpenCodeTranscriptFile(content: string): {
  blocks: ConversationBlock[];
  subagents: SubagentInfo[];
};
```

## How It Connects

| Direction | Package | Relationship |
|-----------|---------|--------------|
| Depends on | shared-types | Block definitions |
| Peer dep | @anthropic-ai/claude-agent-sdk | Optional |
| Peer dep | @opencode-ai/sdk | Optional |
| Used by | agent-runner | Transcript parsing |
| Used by | agent-server | Block conversion |

## Related

- [Streaming and Events](../system/streaming-and-events.md) - Event and block types
- [agent-runner](./agent-runner.md) - Uses converters
- [shared-types](./shared-types.md) - Type definitions
