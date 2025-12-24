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
    SDK[Claude SDK] -->|raw events| Conv[Converters]
    Conv -->|SessionEvent| Runner[agent-runner]
    Runner -->|SessionEvent JSONL| EE[ExecutionEnvironment]
    EE -->|enriches context| SEB[SessionEventBus]
    SEB -->|session:event| CH[ClientHub]
    CH -->|broadcast| WS[WebSocket]
    WS -->|session:event| Client[React Client]
```

### 1. Event Flow

Events use a unified `SessionEvent` structure that flows unchanged through the entire pipeline:

```typescript
// SessionEvent structure - consistent from runner to client
interface SessionEvent<K extends SessionEventType> {
  type: K;                        // e.g., 'block:start', 'block:delta'
  payload: SessionEventPayloads[K]; // Type-safe payload
  context: SessionEventContext;   // sessionId, conversationId, source, timestamp
}

// ExecutionEnvironment enriches context (adds sessionId) without transforming
executeQuery(args, eventBus: SessionEventBus) {
  const process = await this.primitives.exec([...]);

  for await (const line of readLines(process.stdout)) {
    const event = JSON.parse(line) as SessionEvent;
    // Enrich with sessionId and emit unchanged
    const enriched = enrichEventContext(event, { sessionId });
    eventBus.emit(event.type, enriched);
  }
}

// ClientHub broadcasts single 'session:event' to all clients
eventBus.onAny((event) => {
  clientHub.broadcast(sessionId, 'session:event', event);
});
```

### 2. SessionEvent Types

Events are organized by category in `SessionEventPayloads`:

```typescript
// Block streaming events (high frequency during query execution)
'block:upsert'   // Create or replace a block
'block:delta'    // Incremental text content

// Metadata events
'metadata:update' // Token usage, cost, model info

// Runtime status events
'status'          // Session runtime state changed

// File events (server-originated)
'file:created'   // File created in workspace
'file:modified'  // File modified in workspace
'file:deleted'   // File deleted from workspace

// Transcript events
'transcript:changed' // Combined transcript changed
'transcript:written' // Transcript written to EE filesystem

// Session lifecycle events
'session:initialized' // Session restored or created

// Execution environment lifecycle events
'ee:creating'    // EE creation starting
'ee:ready'       // EE fully initialized
'ee:terminated'  // EE shut down

// Query lifecycle events
'query:started'   // User query begins
'query:completed' // Query finished successfully
'query:failed'    // Query errored

// Subagent events
'subagent:spawned'    // Subagent started (Task tool invoked)
'subagent:completed'  // Subagent finished

// Session lifecycle
'session:idle'        // Session ready for next query (finalizes pending blocks)

// Operational events
'log'    // Operational log message
'error'  // Error occurred

// Options events
'options:update' // Session options changed
```

| Event | When Emitted |
|-------|--------------|
| `block:upsert` | Block created or updated (status: pending → complete) |
| `block:delta` | Each chunk of assistant/thinking text |
| `subagent:spawned` | Task tool invoked, subagent starting |
| `subagent:completed` | Subagent finished with result |
| `session:idle` | Query complete, pending blocks finalized |
| `metadata:update` | Token usage or cost information |
| `status` | Session runtime state transitions |
| `session:initialized` | Session restored from persistence or newly created |
| `ee:creating` | Execution environment creation starting |
| `ee:ready` | Execution environment fully initialized |
| `ee:terminated` | Execution environment shut down |
| `query:started` | User message received, query processing begins |
| `query:completed` | Query finished successfully |
| `query:failed` | Query errored |
| `log` | Informational logs from runner |
| `error` | Operational error occurred |

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
| SessionEvent types | shared-types | Unified event definitions |
| SessionEventPayloads | shared-types | Type-safe payload map |
| ConversationBlock | shared-types | Structured message blocks |
| SessionEventBus | agent-server | Per-session event emitter |
| ClientHub | agent-server | Broadcasts to connected clients |
| createSessionEvent | shared-types | Factory for creating events |
| enrichEventContext | shared-types | Add context without transforming |

## Client-Side Handling

```typescript
// Single unified event handler
socket.on('session:event', (event: SessionEvent) => {
  switch (event.type) {
    case 'block:upsert':
      upsertBlock(event.payload.block);
      break;
    case 'block:delta':
      appendToBlock(event.payload.blockId, event.payload.delta);
      break;
    case 'subagent:spawned':
      createSubagent(event.payload);
      break;
    case 'subagent:completed':
      finalizeSubagent(event.payload);
      break;
    case 'session:idle':
      finalizePendingBlocks(event.context.conversationId);
      break;
    case 'error':
      handleError(event.payload.message);
      break;
    case 'status':
      updateRuntimeState(event.payload.runtime);
      break;
  }
});
```

For conversation state, use the shared reducer for consistency with the server:

```typescript
import { reduceSessionEvent, isConversationEvent } from '@hhopkins/agent-converters';

socket.on('session:event', (event: SessionEvent) => {
  if (isConversationEvent(event)) {
    dispatch(event);  // Uses reduceSessionEvent
  }
  // Handle other events separately
});
```

## Key Insight

SessionEvents are **low-level incremental updates** for real-time UI, while ConversationBlocks are **high-level structured data** for persistence and display. The system uses events during streaming, then parses the final transcript into blocks.

The unified event system means events flow unchanged from runner to client with a consistent `{ type, payload, context }` structure - no transformation layers needed.

## Where It Lives

| Concern | Location |
|---------|----------|
| SessionEvent types | `packages/types/src/runtime/session-events.ts` |
| ConversationBlock types | `packages/types/src/runtime/blocks.ts` |
| SessionEventBus | `runtime/server/src/core/session/session-event-bus.ts` |
| ClientHub interface | `runtime/server/src/core/host/client-hub.ts` |
| Event creation | `packages/types/src/runtime/session-events.ts` (createSessionEvent) |
| Runner output | `runtime/runner/src/cli/shared/output.ts` |

## Related

- [Conversation State](./conversation-state.md) — State machine for blocks and subagents
- [OpenCode Event Reference](./reference/opencode-event-reference.md) — Complete OpenCode SSE event catalog
- [Session Lifecycle](../session-lifecycle.md) — When events are emitted
- [Architecture Overview](../architecture-overview.md) — System structure
