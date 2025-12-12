---
title: Session Folder Consolidation
created: 2025-12-12
status: active
---

# Session Folder Consolidation

## Goal

Reorganize session file structure so that everything related to a single session is contained within one folder. Use `CLAUDE_CONFIG_DIR` environment variable to isolate Claude's configuration and transcripts per session, preventing pollution of the user's home `~/.claude/` directory.

## Background

Currently, sessions are organized under `.agent-sessions/{sessionId}/` with subdirectories (app, workspace, home, mcps). However:

1. Claude transcripts go to `~/.claude/projects/{hash}/{sessionId}.jsonl` (user's actual home directory)
2. No `CLAUDE_CONFIG_DIR` is being set during process execution
3. The `home/` directory exists but isn't fully utilized for Claude isolation
4. `EnvironmentPrimitive` returns 4 separate paths (`APP_DIR`, `WORKSPACE_DIR`, `HOME_DIR`, `BUNDLED_MCP_DIR`) - overly complex

This makes it harder to:
- Clean up or archive sessions
- Debug session issues (files scattered across locations)
- Run multiple isolated sessions without cross-contamination

## Strategy

### Simplified Primitive Interface

**Before:** Primitive returns 4 independent paths
```typescript
interface BasePaths {
  APP_DIR: string;
  WORKSPACE_DIR: string;
  HOME_DIR: string;
  BUNDLED_MCP_DIR: string;
}
```

**After:** Primitive returns just the session root
```typescript
interface BasePaths {
  SESSION_DIR: string;  // Everything else is convention
}
```

### Session Folder Convention

All paths are derived from `SESSION_DIR`:

```
{SESSION_DIR}/
├── .claude/          # CLAUDE_CONFIG_DIR points here
├── app/              # Runner bundle (runner.js, package.json, adapter)
├── mcps/             # Bundled MCP servers
└── workspace/        # Working directory (cwd for processes)
    └── .claude/      # Agent profile (skills, commands, .mcp.json)
```

The caller (ExecutionEnvironment) derives paths:
```typescript
const appDir = join(sessionDir, 'app')
const mcpDir = join(sessionDir, 'mcps')
const workspaceDir = join(sessionDir, 'workspace')
const claudeConfigDir = join(sessionDir, '.claude')
```

### Container Path Mapping (Docker/Modal)

Primitive returns the **host** session dir. Container uses `/session` as root:

| Host Path | Container Path |
|-----------|----------------|
| `{SESSION_DIR}/.claude` | `/session/.claude` |
| `{SESSION_DIR}/app` | `/session/app` |
| `{SESSION_DIR}/mcps` | `/session/mcps` |
| `{SESSION_DIR}/workspace` | `/session/workspace` |

Environment variable set in container: `CLAUDE_CONFIG_DIR=/session/.claude`

### Key Insight

**One session = one folder = one source of truth for paths.**

The primitive's job is simple:
1. Create the session directory
2. Return the path
3. That's it

## Scope

**In scope:**
- Simplify `BasePaths` interface to just `SESSION_DIR`
- Update `LocalPrimitive` to create new structure
- Update `DockerPrimitive` with new mount mappings
- Update `ModalSandbox` for new structure
- Update `ExecutionEnvironment` to derive paths from convention
- Set `CLAUDE_CONFIG_DIR` when spawning processes
- Remove or update `getClaudeTranscriptDir` helper

**Out of scope:**
- Migration of existing `.agent-sessions/` (ephemeral, can be deleted)
- Changes to agent profile loading (stays in `workspace/.claude/`)
- Server-side session management APIs

## Completion Criteria

- [x] Strategy defined and documented
- [ ] `BasePaths` interface simplified to `SESSION_DIR` only
- [ ] Path derivation moved to `ExecutionEnvironment` (or shared utility)
- [ ] `LocalPrimitive` updated
- [ ] `DockerPrimitive` updated with `/session/*` mount mappings
- [ ] `ModalSandbox` updated
- [ ] `CLAUDE_CONFIG_DIR` set in process spawn environment
- [ ] `getClaudeTranscriptDir` updated or removed
- [ ] All execution types tested and working

## Current Status

Strategy clarified. Ready for implementation.

## Quick Links

- [Sessions](sessions/)
- [Plans](plans/)
