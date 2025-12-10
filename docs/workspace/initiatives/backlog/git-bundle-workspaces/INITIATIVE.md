---
title: Git Bundle Workspaces
created: 2025-12-10
status: backlog
---

# Git Bundle Workspaces

## Goal

Enable storing workspaces as git bundles rather than tracking every single file individually. This wouldn't fully replace the workspace file abstraction (still needed for the client), but utilizing git and its features could open the door to powerful capabilities like versioning, diffing, and efficient storage.

## Scope

**In scope:**
- Git bundle storage option for workspaces
- Bundle creation/extraction utilities
- Integration with existing workspace abstraction
- Leveraging git features (history, diffs, branches)

**Out of scope:**
- Removing the workspace file abstraction (still needed for client)
- Full git hosting functionality
- Remote git operations

## Completion Criteria

- [ ] Git bundle storage implementation
- [ ] Bundle creation from workspace state
- [ ] Bundle extraction to workspace state
- [ ] Workspace abstraction continues to work for clients
- [ ] Exploration of git features (versioning, diffs) documented
- [ ] Documentation updated

## Current Status

Not started - in backlog.

## Notes

The workspace file abstraction must remain for client compatibility. Git bundles would be an alternative storage mechanism that could unlock features like:
- Efficient storage (deduplication)
- Version history
- Diff capabilities
- Branching/merging workspaces

## Quick Links

- [Sessions](sessions/)
