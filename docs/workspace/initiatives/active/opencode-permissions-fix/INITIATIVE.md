---
title: Fix OpenCode File Operations Hanging
created: 2025-12-18
status: active
---

# Fix OpenCode File Operations Hanging

## Goal

Fix the issue where OpenCode file read/write operations hang indefinitely in headless execution mode. Tools show status "running" but never complete because they're waiting for permission approval that never comes.

## Problem

When running OpenCode sessions in the agent-service backend:
1. File operations (read, write, edit) hang with status "running"
2. The OpenCode SDK is waiting for permission approval
3. Running in headless mode means no UI to respond to permission prompts
4. Sessions become unusable for any file operations

## Root Cause

The OpenCode SDK requires permission configuration to auto-approve tools in headless mode:
- No permissions are configured in `opencode.json`
- No `permission.ask` hook exists to auto-approve tools
- The Claude SDK handles this with `permissionMode: 'bypassPermissions'`, but OpenCode has no equivalent

## Scope

**In scope:**
- Add permission configuration to `opencode.json` generation
- Auto-approve file operation tools (edit, bash, webfetch, external_directory)
- Test with read/write operations

**Out of scope:**
- Changing permission model for interactive use
- Adding granular per-tool permission controls

## Completion Criteria

- [ ] `writePermissions()` method added to `OpenCodeEntityWriter`
- [ ] Permissions auto-configured when loading agent profile
- [ ] File read operations complete without hanging
- [ ] File write operations complete without hanging
- [ ] Documentation updated

## Implementation Plan

### Files to Modify

1. **`packages/opencode-entity-manager/src/OpenCodeEntityWriter.ts`**
   - Add `writePermissions()` method

2. **`runtime/runner/src/core/load-agent-profile.ts`**
   - Call `writePermissions()` after entity sync

### OpenCode Permission Configuration

From [OpenCode docs](https://opencode.ai/docs/permissions):

```json
{
  "permission": {
    "edit": "allow",
    "bash": "allow",
    "webfetch": "allow",
    "doom_loop": "ask",
    "external_directory": "allow"
  }
}
```

Five tools support permission controls:
- **edit** — File modification operations
- **bash** — Command execution (supports granular per-command rules)
- **webfetch** — Web page retrieval
- **doom_loop** — Detects when identical tool calls repeat 3+ times
- **external_directory** — File operations outside the working directory

Note: By default, all tools are **enabled** and don't need permission. But for headless execution, we should explicitly set `"allow"` to ensure no prompts.

## Reference Links

- [OpenCode Permissions Docs](https://opencode.ai/docs/permissions)
- [OpenCode Tools Docs](https://opencode.ai/docs/tools/)
- Plan file: `/Users/hunterhopkins/.claude/plans/atomic-nibbling-storm.md`

## Current Status

Active - ready to implement.

## Quick Links

- [Sessions](sessions/)
