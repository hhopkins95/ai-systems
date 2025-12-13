# Streaming and Events

How agent responses stream through the system and are structured as conversation blocks.

## What It Does

The streaming system handles real-time agent output:

- Streams response chunks from SDK to client
- Normalizes events across different AI architectures
- Structures conversations as typed blocks
- Enables progressive UI rendering

## How It Works

```mermaid
flowchart LR
    SDK[Claude SDK] -->|raw events| Runner[agent-runner]
    Runner -->|StreamEvent JSON| EE[ExecutionEnvironment]
    EE -->|emits| SEB[SessionEventBus]
    SEB -->|ClientBroadcastListener| CH[ClientHub]
    CH -->|broadcast| WS[WebSocket]
    WS -->|message| Client[React Client]
```

### 1. Event Flow

Events originate from the SDK and flow through layers:

```typescript
// ExecutionEnvironment emits events to session's event bus
executeQuery(args, eventBus: SessionEventBus) {
  const process = await this.primitives.exec([...]);

  for await (const line of readLines(process.stdout)) {
    const event = JSON.parse(line) as StreamEvent;
    // Emit to per-session event bus (no sessionId needed - implicit)
    eventBus.emit('block:delta', { conversationId, blockId, delta: event.delta });
  }
}

// ClientBroadcastListener subscribes and forwards to ClientHub
eventBus.on('block:delta', (data) => {
  clientHub.broadcast(sessionId, 'session:block:delta', { sessionId, ...data });
});
```

### 2. StreamEvent Types

StreamEvents are divided into conversation events and execution events:

```typescript
type StreamEvent =
  // Conversation events
  | BlockStartEvent       // New block begins (may be incomplete)
  | TextDeltaEvent        // Incremental text for streaming
  | BlockUpdateEvent      // Block metadata changes
  | BlockCompleteEvent    // Block finalized
  | MetadataUpdateEvent   // Token usage, cost updates
  // Execution events
  | StatusEvent           // Environment state changes
  | LogEvent              // Operational logs
  | ErrorEvent            // Operational errors
  | ScriptOutput;         // Final result from non-streaming commands
```

| Event | When Emitted |
|-------|--------------|
| `block_start` | New conversation block begins |
| `text_delta` | Each chunk of assistant/thinking text |
| `block_update` | Block status changes (e.g., tool pending → running) |
| `block_complete` | Block finalized with full content |
| `metadata_update` | Token usage or cost information |
| `status` | Execution environment state transitions |
| `log` | Informational logs from runner |
| `error` | Operational error occurred |
| `script_output` | Final result from non-streaming CLI commands |

### 3. ConversationBlock Structure

After streaming completes, the transcript is parsed into blocks:

```typescript
type ConversationBlock =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock
  | ImageBlock;

interface TextBlock {
  type: 'text';
  role: 'user' | 'assistant';
  content: string;
}

interface ToolUseBlock {
  type: 'tool_use';
  toolName: string;
  toolId: string;
  input: Record<string, unknown>;
}

interface ToolResultBlock {
  type: 'tool_result';
  toolId: string;
  output: string;
  isError: boolean;
}
```

## Key Components

| Component | Package | Purpose |
|-----------|---------|---------|
| StreamEvent types | shared-types | Event definitions from runner |
| ConversationBlock | shared-types | Structured message blocks |
| SessionEventBus | agent-server | Per-session event emitter |
| ClientHub | agent-server | Broadcasts to connected clients |
| ClientBroadcastListener | agent-server | Bridges SessionEventBus to ClientHub |
| TranscriptParser | converters | Parse raw transcripts |

## Client-Side Handling

```typescript
// In useAgentClient hook
socket.on('stream:event', (data) => {
  const { sessionId, event } = data;

  switch (event.type) {
    case 'text_delta':
      appendToCurrentMessage(event.delta);
      break;
    case 'message_complete':
      finalizeCurrentMessage(event.content);
      break;
    case 'error':
      handleError(event.message);
      break;
  }
});
```

## Key Insight

StreamEvents are **low-level incremental updates** for real-time UI, while ConversationBlocks are **high-level structured data** for persistence and display. The system uses events during streaming, then parses the final transcript into blocks.

## Where It Lives

| Concern | Location |
|---------|----------|
| StreamEvent types | `packages/types/src/runtime/stream-events.ts` |
| ConversationBlock types | `packages/types/src/runtime/blocks.ts` |
| SessionEventBus | `runtime/server/src/core/session/session-event-bus.ts` |
| ClientHub interface | `runtime/server/src/core/host/client-hub.ts` |
| ClientBroadcastListener | `runtime/server/src/core/session/client-broadcast-listener.ts` |
| Transcript parsing | `packages/converters/src/` |
| Runner output utilities | `runtime/runner/src/cli/shared/output.ts` |

## Related

- [Core Concepts](./core-concepts.md) - SessionEventBus, ClientHub patterns
- [Architecture Overview](./architecture-overview.md) - System structure
- [Session Lifecycle](./session-lifecycle.md) - When events are emitted
- [agent-converters](../packages/agent-converters.md) - Transcript parsing
