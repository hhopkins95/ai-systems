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
- Efficient loading through persistence adapter
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

## Technical Considerations

### Persistence Adapter Extensions

```typescript
interface WorkspacePersistence {
  // Workspace lifecycle
  createWorkspace(name?: string): Promise<Workspace>;
  loadWorkspace(workspaceId: string): Promise<Workspace>;
  deleteWorkspace(workspaceId: string): Promise<void>;

  // File operations (maintains current abstraction)
  getWorkspaceFiles(workspaceId: string, ref?: string): Promise<WorkspaceFile[]>;
  saveWorkspaceFile(workspaceId: string, file: WorkspaceFile): Promise<void>;
  deleteWorkspaceFile(workspaceId: string, path: string): Promise<void>;

  // Git operations
  commitWorkspace(workspaceId: string, message?: string): Promise<string>; // returns commit hash
  checkpointWorkspace(workspaceId: string, name: string): Promise<string>;
  listCheckpoints(workspaceId: string): Promise<Checkpoint[]>;

  // History
  diffWorkspace(workspaceId: string, from: string, to: string): Promise<FileDiff[]>;
  getWorkspaceHistory(workspaceId: string): Promise<Commit[]>;

  // Branching
  forkWorkspace(workspaceId: string, name?: string): Promise<Workspace>;

  // Bundle operations (for transfer/backup)
  bundleWorkspace(workspaceId: string): Promise<Buffer>;
  unbundleWorkspace(bundle: Buffer, name?: string): Promise<Workspace>;
}
```

### Loading Efficiency Considerations

**Challenge:** Git stores full repo history. Loading all files for every session resume could be slow.

**Options to explore:**
1. **Lazy loading** — Load file list first, content on demand
2. **Working tree cache** — Keep extracted working tree alongside bundle
3. **Sparse checkout** — Only load files the session actually needs
4. **Object store separation** — Share objects across workspaces, bundle per-workspace refs only

### Data Flow Impact

**Session start:**
```
1. Create or reference Workspace
2. Load WorkspaceFile[] from workspace (at HEAD or specific ref)
3. Initialize execution environment with files
4. Session tracks workspaceId + current ref
```

**During session:**
```
1. File changes persisted immediately (current behavior)
2. Changes staged in git working tree
3. End of turn → auto-commit
4. Client receives WorkspaceFile events (unchanged)
```

**Session end/pause:**
```
1. Final commit if uncommitted changes
2. Optionally bundle for archival
3. Session stores final ref for resume
```

**Session resume:**
```
1. Load workspace at stored ref
2. Reconstruct WorkspaceFile[]
3. Continue
```

## Completion Criteria

- [ ] Workspace entity and table created
- [ ] Session references workspace by ID
- [ ] Git-based workspace storage implementation
- [ ] Auto-commit at turn boundaries
- [ ] Checkpoint/tagging support
- [ ] Efficient file loading (lazy or cached)
- [ ] Fork workspace functionality
- [ ] Migration for existing sessions
- [ ] WorkspaceFile abstraction preserved for clients
- [ ] Documentation updated

## Current Status

Not started - in backlog. Brainstorming complete.

## Open Questions

1. **Storage backend** — Bare git repos on disk? Git objects in DB? Bundle-only?
2. **Cross-workspace dedup** — Shared object store worth the complexity?
3. **Binary files** — Include in git? Separate blob store?
4. **History limits** — Prune old history? Keep forever?

## Quick Links

- [Sessions](sessions/)
