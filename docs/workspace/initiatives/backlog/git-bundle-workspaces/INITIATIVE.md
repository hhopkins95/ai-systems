---
title: Git Bundle Workspaces
created: 2025-12-10
status: backlog
---

# Git Bundle Workspaces

## Goal

Promote workspaces to first-class entities with git-based storage. This enables version history, diffing, branching, and efficient storage while maintaining the `WorkspaceFile[]` abstraction for client compatibility.

## Scope

**In scope:**
- Workspace as independent entity (decoupled from session)
- Git-based storage backend for workspaces
- Commit model (auto-commit at turn boundaries, named checkpoints)
- Separate module architecture (outside runtime core)
- Migration path from current embedded model

**Out of scope:**
- Remote git operations (push/pull to external repos)
- Multi-user collaboration (future initiative)
- Full git hosting functionality

## Data Model Change

### Current Model
```
Session 1:1 Workspace (embedded as WorkspaceFile[])
```

### Proposed Model
```typescript
interface Workspace {
  id: string;
  name?: string;
  createdAt: Date;
  // Git storage reference
}

interface Session {
  id: string;
  workspaceId: string;      // Reference to workspace
  workspaceRef?: string;    // Git ref (branch/commit) this session is on
}
```

### What This Enables
- Workspace outlives session — pause, resume, or start new session against same workspace
- Forking — branch a workspace for experimentation
- Templates — start sessions from a workspace template
- History — full change history with diffs between any points

## Commit Model

**Layered approach:**

| Layer | Trigger | Purpose |
|-------|---------|---------|
| Auto-save | Every file change | Crash recovery (current behavior, not git) |
| Auto-commit | End of turn | Predictable history at natural boundaries |
| Checkpoints | User/agent triggered | Named meaningful points |

Agent could have a `checkpoint` tool for semantic commits with messages.

## Architecture Direction

### Key Insight: Git on Server Only

The execution environment doesn't need git — it just needs files. Git is a storage/versioning concern, not an execution concern.

```
Exec Env                                    Server
────────                                    ──────
file write ──── event { path, content } ───▶ write to git working tree
                                            │
                                            ▼ (end of turn)
                                            git commit
```

- Exec env doesn't know git exists (no changes needed)
- Server receives file events (same as today), writes to working tree
- Server commits at turn boundaries
- No bundle transfer to/from exec env
- Bundle only used for backup/transfer between servers

### Separate Module (Not in Runtime)

Since git is purely a server-side storage concern, it should live **outside the runtime** as an optional module that wraps or composes with the persistence adapter.

```
┌─────────────────────────────────────────────┐
│                  Runtime                     │
│  ┌─────────────────────────────────────┐    │
│  │  AgentSession (unchanged)            │    │
│  └──────────────────┬──────────────────┘    │
│                     ▼                        │
│  ┌─────────────────────────────────────┐    │
│  │  PersistenceAdapter (basic)          │    │
│  │    - saveWorkspaceFile()             │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│  GitWorkspaceManager (separate package)     │
│    - wraps or observes persistence          │
│    - maintains git repos                    │
│    - commits, bundles, history              │
└─────────────────────────────────────────────┘
```

Benefits:
- **Optional** — use it or don't, runtime doesn't care
- **Composable** — wrap any persistence adapter
- **Separate package** — e.g. `@ai-systems/git-workspace-manager`
- **Clear boundary** — runtime handles execution, this handles versioned storage
- **Calling app decides** — whether to use git workspaces or plain file storage

### Sketch of Module Interface

```typescript
// packages/git-workspace-manager/

class GitWorkspaceManager {
  constructor(
    private baseAdapter: PersistenceAdapter,  // delegates basic storage
    private gitStoragePath: string
  ) {}

  // Wraps base adapter, adds git tracking
  async saveWorkspaceFile(workspaceId: string, file: WorkspaceFile): Promise<void>;

  // Git-specific operations
  async commit(workspaceId: string, message?: string): Promise<string>;
  async checkpoint(workspaceId: string, name: string): Promise<string>;
  async getHistory(workspaceId: string): Promise<Commit[]>;
  async diff(workspaceId: string, from: string, to: string): Promise<Diff>;
  async fork(workspaceId: string): Promise<Workspace>;
  async bundle(workspaceId: string): Promise<Buffer>;
  async restore(bundle: Buffer): Promise<Workspace>;
}
```

## Loading Efficiency

**Recommended approach:** Working tree on disk + lazy loading

- Active workspace = real git repo on disk (fast file access)
- `getWorkspaceFiles()` reads working tree directly
- Bundle created on demand for archival/transfer
- Manifest-first loading for large workspaces (file list, then content on demand)

## Open Questions

1. **Storage backend** — Bare git repos on disk? Git objects in DB? Bundle-only?
2. **Cross-workspace dedup** — Shared object store worth the complexity?
3. **Binary files** — Include in git? Separate blob store?
4. **History limits** — Prune old history? Keep forever?
5. **Integration point** — Wrapper around adapter vs event subscriber vs middleware?

## Completion Criteria

- [ ] Workspace entity defined (separate from session)
- [ ] GitWorkspaceManager module created (separate package)
- [ ] Git repo storage implementation
- [ ] Auto-commit at turn boundaries
- [ ] Checkpoint/tagging support
- [ ] Efficient file loading
- [ ] Fork workspace functionality
- [ ] Bundle export/import
- [ ] Migration path documented
- [ ] WorkspaceFile abstraction preserved for clients

## Current Status

Backlog — brainstorming captured, not scheduled for implementation.

## Quick Links

- [Sessions](sessions/)
