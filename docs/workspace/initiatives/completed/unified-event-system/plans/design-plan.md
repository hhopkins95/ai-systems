# Unified Event System - Design Plan

## Executive Summary

Replace the current three-layer event type system (StreamEvents → SessionEvents → ClientHubEvents) with a single `SessionEvent` type that flows unchanged from runner to client. Events have a consistent `type + payload + context` structure, with context enriched (not transformed) as events flow through the system.

## Current State Analysis

### Three Redundant Type Definitions

| Location | Type Name | Event Count | Naming Convention |
|----------|-----------|-------------|-------------------|
| `packages/types/src/runtime/stream-events.ts` | `StreamEvent` | 9 | `block_start` (snake_case) |
| `runtime/server/src/core/session/session-event-bus.ts` | `SessionEvents` | 14 | `block:start` (colon-separated) |
| `runtime/server/src/core/host/client-hub.ts` | `ClientHubEvents` | 14 | `session:block:start` (prefixed) |

### Manual Transformation Code

1. **`execution-environment.ts:285-351`** - 11-case switch statement mapping StreamEvent → SessionEvents
2. **`client-broadcast-listener.ts:42-160`** - 14 listener registrations mapping SessionEvents → ClientHubEvents

### Key Issues

1. Same payload structure defined 3+ times
2. Event names transformed twice (`block_start` → `block:start` → `session:block:start`)
3. `as any` casts in SocketIOClientHub due to type misalignment
4. sessionId added manually in 14 places in ClientBroadcastListener
5. No single source of truth for event schemas

---

## Proposed Design

### Core Type Structure

```typescript
// packages/types/src/runtime/session-events.ts

/**
 * Event context - enriched as event flows through system
 */
export interface SessionEventContext {
  /** Session this event belongs to (added by server if missing) */
  sessionId: string;

  /** Conversation thread: 'main' or subagent ID (for block events) */
  conversationId?: string;

  /** Where the event originated */
  source?: 'runner' | 'server';

  /** When the event was created */
  timestamp?: string;
}

/**
 * All event payloads - single source of truth
 */
export interface SessionEventPayloads {
  // Block streaming events
  'block:start': { block: ConversationBlock };
  'block:delta': { blockId: string; delta: string };
  'block:update': { blockId: string; updates: Partial<ConversationBlock> };
  'block:complete': { blockId: string; block: ConversationBlock };

  // Metadata
  'metadata:update': { metadata: SessionMetadata };

  // Runtime status
  'status': { status: SessionRuntimeState };

  // File events (server-originated)
  'file:created': { file: WorkspaceFile };
  'file:modified': { file: WorkspaceFile };
  'file:deleted': { path: string };

  // Transcript (server-originated)
  'transcript:changed': { content: string };

  // Subagent events
  'subagent:discovered': { subagent: { id: string; blocks: ConversationBlock[] } };
  'subagent:completed': { subagentId: string; status: 'completed' | 'failed' };

  // Operational
  'log': { level?: LogLevel; message: string; data?: Record<string, unknown> };
  'error': { message: string; code?: string; data?: Record<string, unknown> };

  // Options
  'options:update': { options: AgentArchitectureSessionOptions };
}

/**
 * Unified session event - same structure everywhere
 */
export type SessionEvent<K extends keyof SessionEventPayloads = keyof SessionEventPayloads> = {
  type: K;
  payload: SessionEventPayloads[K];
  context: SessionEventContext;
};

/**
 * Discriminated union of all events
 */
export type AnySessionEvent = {
  [K in keyof SessionEventPayloads]: SessionEvent<K>;
}[keyof SessionEventPayloads];
```

### Type Guards

```typescript
// Type guard for specific event types
export function isSessionEvent<K extends keyof SessionEventPayloads>(
  event: AnySessionEvent,
  type: K
): event is SessionEvent<K> {
  return event.type === type;
}

// Convenience guards
export function isBlockEvent(event: AnySessionEvent): boolean {
  return event.type.startsWith('block:');
}

export function isFileEvent(event: AnySessionEvent): boolean {
  return event.type.startsWith('file:');
}
```

### Helper Functions

```typescript
// Create events with type safety
export function createSessionEvent<K extends keyof SessionEventPayloads>(
  type: K,
  payload: SessionEventPayloads[K],
  context: Partial<SessionEventContext> = {}
): SessionEvent<K> {
  return {
    type,
    payload,
    context: {
      sessionId: context.sessionId ?? '',
      ...context,
      timestamp: context.timestamp ?? new Date().toISOString(),
    },
  };
}

// Enrich context without modifying payload
export function enrichEventContext(
  event: AnySessionEvent,
  additions: Partial<SessionEventContext>
): AnySessionEvent {
  return {
    ...event,
    context: { ...event.context, ...additions },
  };
}
```

---

## Component Changes

### 1. Runner (`runtime/runner`)

**Current:** Emits raw StreamEvents as JSONL
```typescript
// output.ts
writeStreamEvent({ type: 'block_start', conversationId, block });
```

**New:** Emits full SessionEvent structure
```typescript
// output.ts
export function emitSessionEvent<K extends keyof SessionEventPayloads>(
  type: K,
  payload: SessionEventPayloads[K],
  context: Partial<SessionEventContext> = {}
): void {
  const event = createSessionEvent(type, payload, {
    source: 'runner',
    ...context,
  });
  process.stdout.write(JSON.stringify(event) + '\n');
}

// Usage
emitSessionEvent('block:start', { block }, { conversationId });
```

**Files to modify:**
- `runtime/runner/src/cli/shared/output.ts` - New emit helpers
- `runtime/runner/src/helpers/create-stream-events.ts` - Update or remove
- `runtime/runner/src/core/execute-claude-query.ts` - Use new emitters
- `runtime/runner/src/core/execute-opencode-query.ts` - Use new emitters

### 2. ExecutionEnvironment (`runtime/server`)

**Current:** Parses StreamEvent, transforms to SessionEvent via switch statement
```typescript
private emitStreamEvent(event: StreamEvent): void {
  switch (event.type) {
    case 'block_start':
      this.eventBus.emit('block:start', {
        conversationId: event.conversationId,
        block: event.block,
      });
      break;
    // ... 10 more cases
  }
}
```

**New:** Parse SessionEvent, enrich context, emit directly
```typescript
private emitSessionEvent(event: AnySessionEvent): void {
  // Enrich with sessionId (runner doesn't know it)
  const enriched = enrichEventContext(event, {
    sessionId: this.sessionId,
  });

  // Emit directly - no transformation needed
  this.eventBus.emit(enriched.type, enriched);
}
```

**Files to modify:**
- `runtime/server/src/core/session/execution-environment.ts` - Simplify emitStreamEvent

### 3. SessionEventBus (`runtime/server`)

**Current:** Custom `SessionEvents` interface with payload definitions
```typescript
export interface SessionEvents {
  'block:start': { conversationId: string; block: ConversationBlock };
  // ... duplicated payload definitions
}
```

**New:** Use `SessionEventPayloads` from shared types, full event structure
```typescript
import { SessionEventPayloads, AnySessionEvent } from '@ai-systems/shared-types';

// The bus emits full SessionEvent objects, not just payloads
export class SessionEventBus extends EventEmitter {
  emit<K extends keyof SessionEventPayloads>(
    type: K,
    event: SessionEvent<K>
  ): boolean {
    return super.emit(type, event);
  }

  on<K extends keyof SessionEventPayloads>(
    type: K,
    listener: (event: SessionEvent<K>) => void
  ): this {
    return super.on(type, listener as any);
  }
}
```

**Files to modify:**
- `runtime/server/src/core/session/session-event-bus.ts` - Use shared types

### 4. ClientBroadcastListener (`runtime/server`)

**Current:** 14 manual listeners that transform and add sessionId
```typescript
this.eventBus.on('block:start', (data) => {
  this.clientHub.broadcast(this.sessionId, 'session:block:start', {
    sessionId: this.sessionId,
    conversationId: data.conversationId,
    block: data.block,
  });
});
// ... 13 more
```

**New:** Generic forwarder - events already have sessionId in context
```typescript
private setupListeners(): void {
  const eventTypes: Array<keyof SessionEventPayloads> = [
    'block:start', 'block:delta', 'block:update', 'block:complete',
    'metadata:update', 'status', 'file:created', 'file:modified',
    'file:deleted', 'subagent:discovered', 'subagent:completed',
    'log', 'error', 'options:update',
  ];

  for (const type of eventTypes) {
    this.eventBus.on(type, (event) => {
      // Event already has full structure with context.sessionId
      this.clientHub.broadcast(event.context.sessionId, event);
    });
  }
}
```

**Files to modify:**
- `runtime/server/src/core/session/client-broadcast-listener.ts` - Simplify to generic forwarder

### 5. ClientHub Interface (`runtime/server`)

**Current:** `ClientHubEvents` interface with explicit payload types
```typescript
export interface ClientHubEvents {
  'session:block:start': { sessionId: string; conversationId: string; block: ConversationBlock };
  // ... more
}
```

**New:** Accept `AnySessionEvent` directly
```typescript
export interface ClientHub {
  broadcast(sessionId: string, event: AnySessionEvent): void;
  getClientCount(sessionId: string): number;
}
```

**Files to modify:**
- `runtime/server/src/core/host/client-hub.ts` - Simplify interface
- `runtime/server/src/lib/hosts/local/socket-io-client-hub.ts` - Update implementation

### 6. WebSocket Types (`runtime/server`)

**Current:** `ServerToClientEvents` with callback signatures
```typescript
export interface ServerToClientEvents {
  'session:block:start': (data: { sessionId: string; ... }) => void;
  // ...
}
```

**New:** Single event handler that receives `AnySessionEvent`
```typescript
export interface ServerToClientEvents {
  'session:event': (event: AnySessionEvent) => void;
  // Keep 'error' for backwards compat if needed
  'error': (error: { message: string; code?: string; sessionId?: string }) => void;
}
```

**Alternative:** Keep current event names but use unified payload
```typescript
export interface ServerToClientEvents {
  'session:event': (event: AnySessionEvent) => void;
}
```

**Files to modify:**
- `runtime/server/src/types/events.ts` - Simplify to single event type

### 7. Client (`runtime/client`)

**Current:** Listens to multiple specific events
```typescript
wsManager.on('session:block:start', handler);
wsManager.on('session:block:delta', handler);
// ...
```

**New:** Listen to single `session:event`, dispatch by type
```typescript
wsManager.on('session:event', (event: AnySessionEvent) => {
  switch (event.type) {
    case 'block:start':
      dispatch({ type: 'BLOCK_STARTED', event });
      break;
    // ...
  }
});
```

**Files to modify:**
- `runtime/client/src/client/websocket.ts` - Update listener types
- `runtime/client/src/context/AgentServiceProvider.tsx` - Update event handling
- `runtime/client/src/types/index.ts` - Re-export from shared types

---

## Migration Strategy

### Phase 1: Define Unified Types (Non-breaking)

1. Create `packages/types/src/runtime/session-events.ts` with new types
2. Export from package alongside existing types
3. Add helper functions (createSessionEvent, enrichEventContext)
4. **No changes to existing code**

### Phase 2: Update Runner (Breaking for server, not client)

1. Update runner to emit new SessionEvent format
2. Server must be updated simultaneously
3. Client unaffected (server still transforms)

### Phase 3: Update Server (Internal changes)

1. Update ExecutionEnvironment to expect new format
2. Update SessionEventBus to use shared types
3. Update ClientBroadcastListener to be a simple forwarder
4. Update ClientHub interface
5. **Client still receives old format via SocketIOClientHub transformation**

### Phase 4: Update Wire Protocol (Breaking for client)

1. Update ServerToClientEvents to emit SessionEvent directly
2. Update client to receive new format
3. Remove transformation layer in SocketIOClientHub

### Phase 5: Cleanup

1. Remove old `StreamEvent` type (or deprecate)
2. Remove old `SessionEvents` interface from server
3. Remove old `ClientHubEvents` interface
4. Remove type guards for old types

---

## Backwards Compatibility

### Option A: Big Bang (Recommended for internal system)

All components updated together in single PR. Simpler, cleaner, but requires coordinated deployment.

### Option B: Gradual with Adapter

Keep old types, add adapter layer that converts between old and new. More complex but allows independent deployment.

**Recommendation:** Option A. This is an internal system, and the changes are straightforward. A single coordinated update is cleaner.

---

## File Change Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `packages/types/src/runtime/session-events.ts` | **NEW** | Unified event types |
| `packages/types/src/runtime/stream-events.ts` | Deprecate | Mark as deprecated, keep for reference |
| `packages/types/src/index.ts` | Modify | Export new types |
| `runtime/runner/src/cli/shared/output.ts` | Modify | New emitSessionEvent helper |
| `runtime/runner/src/helpers/create-stream-events.ts` | Remove/Replace | No longer needed |
| `runtime/runner/src/core/execute-claude-query.ts` | Modify | Use new emitters |
| `runtime/runner/src/core/execute-opencode-query.ts` | Modify | Use new emitters |
| `runtime/server/src/core/session/execution-environment.ts` | Simplify | Remove switch statement |
| `runtime/server/src/core/session/session-event-bus.ts` | Simplify | Use shared types |
| `runtime/server/src/core/session/client-broadcast-listener.ts` | Simplify | Generic forwarder |
| `runtime/server/src/core/host/client-hub.ts` | Simplify | Accept AnySessionEvent |
| `runtime/server/src/lib/hosts/local/socket-io-client-hub.ts` | Simplify | Forward directly |
| `runtime/server/src/types/events.ts` | Simplify | Single event type |
| `runtime/client/src/client/websocket.ts` | Modify | Handle new event format |
| `runtime/client/src/context/AgentServiceProvider.tsx` | Modify | Update event handling |
| `runtime/client/src/types/index.ts` | Modify | Re-export from shared |

---

## Testing Strategy

1. **Unit tests for new types** - Type guards, helper functions
2. **Integration test for runner** - Verify JSONL output format
3. **Integration test for server** - Verify events flow correctly
4. **E2E test** - Full flow from query to client

---

## Success Criteria

- [ ] Single `SessionEvent` type definition in `packages/types`
- [ ] Runner outputs `{ type, payload, context }` format
- [ ] No switch statements for event transformation
- [ ] No manual sessionId injection in 14+ places
- [ ] No `as any` casts in event handling
- [ ] All existing tests pass
- [ ] New type guard tests pass
- [ ] Event payloads identical before/after (semantic equivalence)

---

## Estimated Scope

- **New code:** ~150 lines (types + helpers)
- **Removed code:** ~200 lines (transformation logic)
- **Modified code:** ~300 lines across 15 files
- **Net change:** Reduction of ~50 lines with significantly improved type safety
