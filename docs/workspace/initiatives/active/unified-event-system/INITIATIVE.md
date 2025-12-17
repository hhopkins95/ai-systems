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

Starting initial design - creating implementation plan.

## Quick Links

- [Sessions](sessions/)
- [Design Plan](plans/design-plan.md)
