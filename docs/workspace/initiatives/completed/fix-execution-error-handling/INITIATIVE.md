---
title: Fix Execution Error Handling
created: 2025-12-10
status: active
---

# Fix Execution Error Handling

## Goal

Improve error handling and client communication when agent execution fails. Currently, when the backend encounters errors (like missing Modal context for sandboxed execution), the frontend receives no feedback - users see nothing happen. We need a robust system to communicate execution status and errors to clients.

## Problem Context

Backend logs show errors like:
```
Error sending message to session: Error: Modal context is required
    at Function.create (runtime/server/src/lib/environment-primitives/modal/index.ts:24:19)
```

With `sandboxStatus: "none"`, but:
- No error is displayed to the user
- No status indication on the frontend
- User has no idea why their message didn't work

## Scope

**In scope:**
- Error propagation from backend to frontend via WebSocket
- Frontend error display/notification system
- Execution status indicators (loading, error, success states)
- Graceful degradation when sandbox isn't available
- User-friendly error messages

**Out of scope:**
- Fixing the underlying Modal context issue (separate concern)
- Backend logging improvements
- Authentication/session errors (different flow)

## Completion Criteria

- [x] Backend sends structured error responses via WebSocket when execution fails
- [x] Frontend displays error notifications to users (ErrorBlock in conversation)
- [x] Loading/pending states shown while waiting for execution
- [ ] Error messages are user-friendly (not raw stack traces)
- [ ] Tested error scenarios documented
- [ ] Documentation updated

## Current Status

Backend fixes implemented. Frontend should now receive proper error state updates.

## Quick Links

- [Sessions](sessions/)

## Investigation Findings

### Issue 1: State Not Updated on Error

**Location:** `agent-session.ts:211-252` (`activateExecutionEnvironment`)

The flow:
1. Line 220: `emitRuntimeStatus("Creating execution environment...")` - sets statusMessage
2. Line 221: `ExecutionEnvironment.create()` throws error
3. **No try-catch** around this - error propagates up
4. `sandboxStatus` remains `'starting'` (set at line 370)
5. `statusMessage` remains `"Creating execution environment..."`

**Result:** UI is stuck showing "Creating execution environment..." forever.

### Issue 2: Error IS Emitted, But State Not Updated

**Location:** `agent-session.ts:460-472` (`sendMessage` catch block)

```typescript
} catch (error) {
  logger.error({ ... }, 'Failed to send message');
  this.eventBus.emit('session:error', { ... });  // ✓ Error emitted
  throw error;
}
```

The `session:error` event IS emitted to WebSocket clients, BUT:
- `sandboxStatus` is NOT updated to `'error'`
- `statusMessage` is NOT updated to show failure
- `session:status` is NOT re-emitted with error state

### Issue 3: REST Route Behavior

**Location:** `messages.ts:56-67`

```typescript
session.sendMessage(content).catch((error) => {
  console.error(...);  // Just logs, relies on WebSocket
});
return c.json({ success: true, ... });  // Returns success immediately
```

This is actually fine - fire-and-forget design with WebSocket for updates. But the WebSocket events need to be complete.

### Root Causes Summary

| Problem | Location | Fix Needed |
|---------|----------|------------|
| Status stuck on "Creating..." | `agent-session.ts:211-252` | Update state in catch block |
| No `session:status` on error | `agent-session.ts:460-472` | Emit status with error state |
| Frontend may not handle error | TBD - needs frontend investigation | Add error handler for `session:error` |

## Proposed Fix

### Backend Changes (`agent-session.ts`)

In the `sendMessage` catch block, before emitting `session:error`:

```typescript
} catch (error) {
  // Update state BEFORE emitting events
  this.sandboxStatus = 'error';
  this.statusMessage = error instanceof Error ? error.message : 'Execution failed';

  // Emit status update first (so UI knows state changed)
  this.emitRuntimeStatus(this.statusMessage);

  // Then emit error event
  this.eventBus.emit('session:error', { ... });

  throw error;
}
```

### Frontend Changes

1. Listen for `session:error` events
2. Display error notification/toast
3. Update UI state from "loading" to "error"

## Files to Modify

**Backend:**
- `runtime/server/src/core/agent-session.ts` - Error state handling

**Frontend (needs investigation):**
- WebSocket event handlers
- Error notification system
- Session status display component
