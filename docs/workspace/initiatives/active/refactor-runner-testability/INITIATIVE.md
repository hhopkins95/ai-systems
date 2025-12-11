---
title: Refactor Runner for Testability
created: 2025-12-10
status: active
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
- Changes to the test harness CLI interface (keep backwards compatible)
- New CLI commands
- Changes to external callers (execution environments)

## Completion Criteria

- [ ] Core functions are directly importable and callable
- [ ] All core functions return `AsyncGenerator<StreamEvent>`
- [ ] Lazy client initialization for OpenCode and Claude SDK
- [ ] Message channel utility for streaming input support
- [ ] Unit tests that call core functions directly (no subprocess)
- [ ] Existing test-harness E2E tests still pass
- [ ] Documentation updated

## Current Status

Planning complete. Ready to begin implementation.

## Quick Links

- [Sessions](sessions/)
- [Architecture Plan](plans/architecture.md)
- [Technical Background](plans/background.md)
