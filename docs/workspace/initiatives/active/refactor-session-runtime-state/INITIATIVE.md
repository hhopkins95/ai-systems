---
title: Refactor Session Runtime State & Execution Events
created: 2025-12-11
status: active
---

# Refactor Session Runtime State & Execution Events

## Goal

Improve the separation of concerns between conversation-level events (blocks) and execution-level events (logs, errors, status). Rename 'sandbox' terminology to 'execution-environment' throughout the codebase for consistency.

## Background

Currently:
- Session logs are emitted as `SystemBlock` with `subtype: 'log'` - but logs aren't conversation content
- Errors outside the conversation flow are mixed with block events
- Execution environment state uses 'sandbox' terminology inconsistently
- No clear separation between EE health status and query execution state

## Scope

**In scope:**
- Add `StatusEvent`, update `LogEvent` with level, keep `ErrorEvent` in StreamEvent union
- Refactor `SessionRuntimeState` to separate `executionEnvironment` state from `activeQuery` state
- Rename all 'sandbox' references to 'execution-environment' in agent-session
- Update runner to emit proper `LogEvent`/`ErrorEvent`/`StatusEvent` instead of SystemBlock logs
- Update ExecutionEnvironment to handle new event types
- Add `session:log` WebSocket event for client-side log streaming
- Update EventBus with new domain events

**Out of scope:**
- Persisting session logs (future work)
- Log filtering/levels configuration
- Metrics collection beyond basic state

## Completion Criteria

- [x] Types package updated with new StreamEvent types and SessionRuntimeState
- [x] Runner emits `LogEvent`, `ErrorEvent`, `StatusEvent` properly
- [x] ExecutionEnvironment handles new event routing
- [x] AgentSession uses 'executionEnvironment' terminology, tracks `activeQuery`
- [x] `session:log` event flows to WebSocket clients
- [x] All references to 'sandbox' renamed in agent-session.ts
- [x] Type-check passes across all packages
- [ ] Documentation updated

## Design Decisions

### StreamEvent Types

```typescript
// Conversation-level (blocks)
| BlockStartEvent
| TextDeltaEvent
| BlockUpdateEvent
| BlockCompleteEvent
| MetadataUpdateEvent

// Execution-level (operational)
| StatusEvent     // EE state transitions
| LogEvent        // informational messages (with level)
| ErrorEvent      // failures
```

### SessionRuntimeState Structure

```typescript
export type ExecutionEnvironmentStatus =
  | 'inactive' | 'starting' | 'ready' | 'error' | 'terminated';

export interface SessionRuntimeState {
  isLoaded: boolean;

  executionEnvironment: {
    id?: string;
    status: ExecutionEnvironmentStatus;
    statusMessage?: string;
    lastHealthCheck?: number;
    restartCount?: number;
    lastError?: { message: string; code?: string; timestamp: number };
  } | null;

  activeQuery?: {
    startedAt: number;
  };
}
```

### Event Flow

```
Runner (emits LogEvent/ErrorEvent/StatusEvent)
    │
    └── ExecutionEnvironment.parseRunnerStream()
            │
            ├── Forward logs to pino logger
            │
            └── Yield all events to AgentSession
                    │
                    ├── Block events → session:block:* WebSocket events
                    ├── Log events → session:log WebSocket event
                    ├── Error events → session:error WebSocket event
                    └── Status events → Update internal state, emit session:status
```

## Current Status

**Implementation complete** (2025-12-11). All code changes merged to `update-runner` branch. Full build passes.

Remaining: Update package documentation to reflect new types.

## Quick Links

- [Sessions](sessions/)
