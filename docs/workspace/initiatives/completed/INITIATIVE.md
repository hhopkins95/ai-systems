---
title: Refactor Runner for Testability
created: 2025-12-10
completed: 2025-12-11
status: completed
---

# Refactor Runner for Testability

## Goal

Refactor the `runtime/runner` package to separate I/O concerns from business logic, making core functions directly callable and testable without subprocess spawning.

## Problem

The current runner architecture tightly couples business logic with CLI I/O:

- Every command reads JSON from stdin directly in the handler
- Output is written to stdout within the same functions
- Testing requires the test harness to spawn subprocesses
- Can't call runner functions directly from scripts or unit tests
- OpenCode/Claude SDK clients are set up per-execution

This makes the codebase harder to test, debug, and extend.

## Scope

**In scope:**

- Extract core logic into pure async generator functions
- Create thin CLI wrapper that handles stdin/stdout
- Implement lazy SDK client initialization
- Add message channel pattern for optional streaming input
- Use Agent SDK streaming input mode internally
- Update existing commands: `execute-query`, `load-agent-profile`, `load-session-transcript`, `read-session-transcript`
- Add unit tests for core functions

**Out of scope:**

- Changes to the converters package
- New CLI commands
- Changes to external callers (execution environments)

## Completion Criteria

- [x] Core functions are directly importable and callable
- [x] All core functions return `AsyncGenerator<StreamEvent>` (for execute-query) or Promise (for others)
- [x] Lazy client initialization for OpenCode and Claude SDK
- [x] Message channel utility for streaming input support
- [x] Unit tests that call core functions directly (no subprocess)
- [x] Old test-harness removed, replaced with simple test scripts
- [x] Documentation updated

## Final Status

**COMPLETED** - All goals achieved.

### What Was Built

```
runtime/runner/src/
├── core/                    # Pure business logic
│   ├── execute-query.ts     # Dispatcher
│   ├── execute-claude-query.ts
│   ├── execute-opencode-query.ts
│   ├── load-agent-profile.ts
│   ├── load-session-transcript.ts
│   └── read-session-transcript.ts
│
├── clients/                 # SDK client management
│   ├── claude.ts            # Lazy Claude executable finder
│   ├── opencode.ts          # Lazy OpenCode client init
│   └── channel.ts           # Message channel utility
│
├── cli/
│   ├── runner.ts            # Entry point
│   ├── commands/            # Thin CLI wrappers (~20 lines each)
│   └── shared/              # I/O utilities
│
└── test/                    # Simple test scripts
    ├── run-all.ts
    ├── test-execute-claude.ts
    ├── test-execute-opencode.ts
    ├── test-load-profile.ts
    └── test-transcripts.ts
```

### Key Changes

1. **Core functions directly importable:**
   ```typescript
   import { executeQuery } from '@hhopkins/agent-runner';
   for await (const event of executeQuery(input)) { ... }
   ```

2. **Old test-harness deleted** - replaced with simple `test/` scripts that call core functions directly

3. **New test commands:**
   - `pnpm test` - runs non-API tests
   - `pnpm test:claude` - runs Claude SDK test
   - `pnpm test:opencode` - runs OpenCode test

## Quick Links

- [Sessions](sessions/)
- [Architecture Plan](plans/architecture.md)
- [Technical Background](plans/background.md)
