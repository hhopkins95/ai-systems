---
title: Unified Event System
created: 2025-12-17
status: active
---

# Unified Event System

## Goal

Consolidate the three separate event type definitions (StreamEvents, SessionEvents, ClientHubEvents) into a single unified `SessionEvent` type with a consistent `type + payload + context` structure used throughout the entire pipeline from runner to client.

## Background

Currently we have:
- `StreamEvent` (9 types) - defined in `packages/types`, emitted by runner as JSONL
- `SessionEvents` (14 types) - defined in `session-event-bus.ts`, different naming convention
- `ServerToClientEvents` (13 types) - defined in `events.ts`, adds `session:` prefix

This results in:
- 28 manual event mapping handlers
- Three different naming conventions (`block_start` → `block:start` → `session:block:start`)
- Type safety loss (`as any` casts)
- Duplicated payload definitions

## Scope

**In scope:**
- Define unified `SessionEvent` types in `packages/types`
- Update `agent-runner` to emit the new format
- Simplify `ExecutionEnvironment` to pass events through (enrich context only)
- Simplify `ClientBroadcastListener` to forward without transformation
- Update `agent-client` to consume the unified type
- Remove redundant type definitions
- Update tests

**Out of scope:**
- Changing what events exist (just unifying how they're structured)
- Adding new event types
- Persistence layer changes (beyond consuming new format)
- Breaking API changes to external consumers (maintain backwards compat where needed)

## Completion Criteria

- [ ] Single `SessionEvent` type definition in `packages/types`
- [ ] `SessionEventPayloads` map defines all event payloads once
- [ ] Runner outputs full `SessionEvent` structure (type + payload + context)
- [ ] Server enriches context without transforming payloads
- [ ] Client receives same `SessionEvent` type as runner emits
- [ ] No `as any` casts in event handling code
- [ ] All manual mapping/transformation code removed
- [ ] Type-safe event emission and handling throughout
- [ ] All existing tests passing
- [ ] New tests for event type safety

## Current Status

**Phases 1-2 complete. Phase 3 partially done.**

### Sessions

- **2025-12-17 (initial):** Created unified `SessionEvent` types in shared-types. Identified architectural insight about converter output.
- **2025-12-17 (phase2):** Completed full migration of converters, runner, and server parsing. Deleted `StreamEvent` entirely.

### What's Done

1. **Unified type definitions** - `SessionEvent<K>` with `type`, `payload`, `context` structure
2. **Converters output `SessionEvent` directly** - Both Claude SDK and OpenCode converters use `createSessionEvent()`
3. **Runner consumes SessionEvent** - No more bridge layer, yields events directly from converters
4. **Server parses SessionEvent** - `execution-environment.ts` updated to handle new format
5. **Legacy types deleted** - `StreamEvent`, `stream-events.ts` removed entirely

### Actual Data Flow (Implemented)

```
SDK Messages → Converters → AnySessionEvent[] → Runner yields → Server parses → EventBus
```

The converters DO output events (not just blocks) for streaming. This was clarified during implementation.

### Progress

- [x] Phase 1: Define unified SessionEvent types
- [x] Phase 2: Update converters and runner
- [~] Phase 3: Update server (parsing done, event bus alignment remaining)
- [ ] Phase 4: Update wire protocol and client
- [ ] Phase 5: Final cleanup

### Remaining Work

**Phase 3 (partial):**
- Server's `SessionEventBus` still defines its own payload types
- Could unify to use `SessionEventPayloads` from shared-types

**Phase 4:**
- `ClientBroadcastListener` transformation layer
- Client-side event consumption

**Phase 5:**
- Remove `as any` casts
- Add event flow tests

## Quick Links

- [Sessions](sessions/)
- [Design Plan](plans/design-plan.md)
