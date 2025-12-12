---
date: 2025-12-11
branch: update-runner
---

# Initial Implementation - Session Runtime State Refactor

## Context

Improve separation of concerns between conversation-level events (blocks) and execution-level events (logs, errors, status). Rename 'sandbox' terminology to 'execution-environment' throughout the codebase.

## Completed

- Added `ExecutionEnvironmentStatus` type (`inactive` | `starting` | `ready` | `error` | `terminated`)
- Added `StatusEvent` to StreamEvent union for EE lifecycle transitions
- Updated `LogEvent` with `level` field for filtering
- Added `code` field to `ErrorEvent` for programmatic handling
- Refactored `SessionRuntimeState` structure:
  - `sandbox` property renamed to `executionEnvironment`
  - Added `activeQuery` state tracking for query-in-progress
  - Added `ExecutionEnvironmentError`, `ExecutionEnvironmentState`, `ActiveQueryState` types
- Created `execution-events.ts` helper functions in runner
- Updated runner to emit proper `LogEvent`/`ErrorEvent` instead of SystemBlock logs
- Updated `ExecutionEnvironment` class to handle new event types with type guards
- Refactored `AgentSession`:
  - Renamed all `sandbox*` variables to `executionEnvironment*` / `ee*`
  - Added `activeQueryStartedAt` and `lastError` tracking
  - Added handling for `log`, `error`, `status` stream events in sendMessage()
- Added `session:log` to EventBus DomainEvents and ServerToClientEvents
- Added WebSocket listener for `session:log` event forwarding
- Updated client package exports
- Updated example frontend components

## Decisions Made

- **Separate `busy` from EE status**: Query execution state (`activeQuery`) is tracked separately from execution environment health status. EE is about container health, activeQuery is about work in progress.
- **Three distinct event channels**: Conversation (blocks), Operational logs (LogEvent), Errors (ErrorEvent), Status (StatusEvent) - each routed differently
- **Logs forwarded to clients**: Runner logs are now streamed to clients via WebSocket for debugging visibility, not just server-side logging

## Blockers / Open Questions

None - implementation complete

## Next Session

- [ ] Test the changes end-to-end with a real session
- [ ] Consider adding log level filtering in client
- [ ] Consider log persistence for session replay/debugging

## Files Changed

**Types Package:**
- `packages/types/src/runtime/stream-events.ts` - Added StatusEvent, updated LogEvent/ErrorEvent
- `packages/types/src/runtime/session.ts` - Refactored SessionRuntimeState

**Runner Package:**
- `runtime/runner/src/core/execution-events.ts` - NEW: Helper functions for event creation
- `runtime/runner/src/core/execute-claude-query.ts` - Emit log/error events
- `runtime/runner/src/core/execute-opencode-query.ts` - Emit log/error events
- `runtime/runner/src/core/types.ts` - Removed local LogEvent type
- `runtime/runner/src/core/index.ts` - Export new helpers

**Server Package:**
- `runtime/server/src/core/execution-environment.ts` - Handle new event types
- `runtime/server/src/core/agent-session.ts` - Major refactor (sandbox → ee)
- `runtime/server/src/core/session-manager.ts` - Updated runtime state refs
- `runtime/server/src/core/event-bus.ts` - Added session:log event
- `runtime/server/src/types/events.ts` - Added session:log to ServerToClientEvents
- `runtime/server/src/transport/websocket/event-listeners.ts` - Added session:log handler

**Client Package:**
- `runtime/client/src/types/index.ts` - Export new types
- `runtime/client/src/index.ts` - Export new types

**Example Frontend:**
- `apps/example-frontend/src/components/SessionHeader.tsx` - Use new API
- `apps/example-frontend/src/components/SessionList.tsx` - Use new API
