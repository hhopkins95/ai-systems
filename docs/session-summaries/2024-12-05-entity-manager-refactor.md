# Session Summary: Claude Entity Manager Refactor

**Date:** December 5, 2024
**Branch:** `update-claude-manager`

---

## Overview

This session focused on improving the data model and architecture of the `claude-entity-manager` package, with the goal of better tracking plugin states, clearer method naming, and introducing a shared types package for the monorepo.

---

## Key Decisions Made

### 1. Plugin State Model

We defined two distinct status dimensions for plugins:

```typescript
type PluginInstallationStatus = "available" | "installed";

type PluginEnabledStatus =
  | "disabled"           // Explicitly false in settings.json
  | "implicit-enabled"   // No entry in settings (default on)
  | "explicit-enabled";  // Explicitly true in settings.json
```

**Rationale:** The existing code only had a boolean `enabled` field. The new model distinguishes between *how* a plugin became enabled, which is useful for:
- UI display (show different states)
- "Reset to defaults" operations
- Understanding user intent

### 2. Entity Source Type Naming

Kept `"global"` instead of renaming to `"user-global"` for backward compatibility:

```typescript
type EntitySourceType = "plugin" | "project" | "global";
```

### 3. Memory Files (CLAUDE.md)

Decided on a **flat list** representation instead of a tree structure:

```typescript
interface MemoryFile {
  path: string;
  content: string;
  frontmatter?: Record<string, unknown>;
  scope: "global" | "project" | "nested";
  relativePath?: string;
  depth?: number;
}
```

**Rationale:** The tree structure adds complexity without significant benefit. Scope and depth fields capture the hierarchy info needed.

### 4. Shared Types Package

Created `@ai-systems/shared-types` as the canonical source of types used across:
- `claude-entity-manager` (discovery/loading)
- `agent-runtime` (execution)
- Future consumers

### 5. Method Naming Convention

Agreed on prefixes to clarify method behavior:

| Prefix | Purpose | Example |
|--------|---------|---------|
| `discover*` | Metadata/counts only, fast | `discoverAllPlugins()` |
| `load*` | Full parsing with content | `loadSkillsFromPlugin()` |
| `get*` | Cached/memory lookup | `getPlugin()` |

### 6. AgentContext as Primary Return Type

The new `loadAgentContext()` method will return everything needed for an agent running in a given folder:

```typescript
interface AgentContext {
  id: string;
  name: string;
  skills: Skill[];
  commands: Command[];
  subagents: Agent[];
  hooks: Hook[];
  mcpServers: McpServerConfig[];
  memoryFiles: MemoryFile[];
  sources: {
    projectDir?: string;
    userGlobalDir: string;
    enabledPlugins: string[];
  };
}
```

---

## Completed Work

### 1. Architecture Documentation
- **Created:** `docs/packages/claude-entity-manager-architecture.md`
- Documents all data sources, file locations, discovery flows, and data model

### 2. Shared Types Package
- **Created:** `packages/shared-types/`
- Files:
  - `src/sources.ts` - EntitySource, EntitySourceType
  - `src/plugin.ts` - Plugin, PluginInstallationStatus, PluginEnabledStatus, etc.
  - `src/mcp.ts` - McpServerConfig
  - `src/entities/skill.ts`, `command.ts`, `agent.ts`, `hook.ts`, `memory-file.ts`
  - `src/agent-context.ts` - AgentContext, AgentContextSources
- Package builds successfully

### 3. Claude Entity Manager Updates
- **Modified:** `packages/claude-entity-manager/src/types.ts`
  - Now imports from `@ai-systems/shared-types`
  - Re-exports shared types for consumers
  - Keeps manager-specific types (manifests, registries, installation)

- **Modified:** `packages/claude-entity-manager/src/discovery/PluginDiscovery.ts`
  - Added `computeEnabledStatus()` helper method
  - Added `installationStatus` and `enabledStatus` to all Plugin creation points

- **Modified:** `packages/claude-entity-manager/src/installation/PluginInstaller.ts`
  - Fixed PluginSource github type to include `owner` field

- Package builds successfully with shared-types dependency

---

## Remaining Work

### High Priority

#### 1. Add `loadAgentContext()` Method
**File:** `packages/claude-entity-manager/src/ClaudeEntityManager.ts`

Create a new method that aggregates all entities into an `AgentContext`:
```typescript
async loadAgentContext(options?: LoadAgentContextOptions): Promise<AgentContext>
```

This should:
- Load memory files (CLAUDE.md) from global, project, nested
- Discover enabled plugins
- Load entities from all sources
- Return the composed AgentContext

#### 2. Rename Methods for Clarity
**File:** `packages/claude-entity-manager/src/ClaudeEntityManager.ts`

Current → Proposed:
- `loadAllEntities()` → `loadEntitiesFromEnabledSources()`
- `loadSkills()` → Split into `loadSkillsFromPlugin()`, `loadSkillsFromProject()`, `loadSkillsFromUserGlobal()`
- Keep old method names as deprecated aliases for backward compat

#### 3. Fix Bug: Skills Showing for Disabled Plugins
**Location:** Config tab in smart-docs shows skills from disabled plugins

**Root cause:** Need to investigate - likely the filtering isn't being applied correctly in the config loading path.

**Fix approach:**
1. Trace the call path from smart-docs to entity loading
2. Ensure `discoverPlugins(false)` is called (excludes disabled)
3. Verify filtering happens before entity aggregation

### Medium Priority

#### 4. Update Agent Runtime
**Files:**
- `packages/agent-runtime/package.json` - Add shared-types dependency
- `packages/agent-runtime/src/types/agent-profiles.ts` - Import from shared-types

Should:
- Import shared entity types
- Keep runtime-specific extensions (environmentVariables, workspaceFiles, etc.)
- Remove duplicate type definitions

#### 5. Update Smart-Docs Consumer
**Location:** `examples/smart-docs/`

- Update imports to use new method names
- Ensure it properly filters by enabled status

---

## File Changes Summary

### New Files
```
docs/packages/claude-entity-manager-architecture.md
packages/shared-types/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── sources.ts
    ├── plugin.ts
    ├── mcp.ts
    ├── agent-context.ts
    └── entities/
        ├── index.ts
        ├── skill.ts
        ├── command.ts
        ├── agent.ts
        ├── hook.ts
        └── memory-file.ts
```

### Modified Files
```
packages/claude-entity-manager/package.json           # Added shared-types dep
packages/claude-entity-manager/src/types.ts           # Import from shared-types
packages/claude-entity-manager/src/discovery/PluginDiscovery.ts  # Added status fields
packages/claude-entity-manager/src/installation/PluginInstaller.ts  # Fixed github source
```

---

## Testing Notes

- Both `shared-types` and `claude-entity-manager` build successfully
- No runtime testing done yet
- Should test:
  - Plugin discovery with various enabled/disabled states
  - Entity loading from all source types
  - The disabled plugins bug fix once implemented

---

## Related Documentation

- Architecture doc: `docs/packages/claude-entity-manager-architecture.md`
- API docs: `docs/packages/claude-entity-manager.md`
- Plan file (if needed): `/Users/hunterhopkins/.claude/plans/idempotent-sprouting-pnueli.md`
