---
title: "Claude Entity Manager - Architecture"
description: "Deep dive into how plugins, marketplaces, and entities are discovered and loaded"
---

# Claude Entity Manager Architecture

## Overview

The Claude Entity Manager is responsible for discovering, loading, and managing Claude Code extensibility entities across three sources: user-global (`~/.claude/`), project (`./.claude/`), and plugins.

---

## Data Sources and File Locations

### 1. User Global Directory (`~/.claude/`)

The user's home Claude directory contains global settings and entities:

```
~/.claude/
├── settings.json                    # Global plugin enable/disable states
├── CLAUDE.md                        # Global memory file
├── skills/
│   └── {skill-name}/
│       ├── SKILL.md                 # Skill definition
│       └── [supporting files]
├── commands/
│   └── {command-name}.md
├── agents/
│   └── {agent-name}.md
├── hooks/
│   ├── hooks.json                   # Or individual .json files
│   └── {hook-name}.json
└── plugins/
    ├── known_marketplaces.json      # Registered marketplaces
    ├── installed_plugins.json       # Installation registry
    ├── marketplaces/
    │   └── {marketplace-name}/
    │       ├── .claude-plugin/
    │       │   └── marketplace.json
    │       └── {plugin-name}/
    └── cache/
        └── {standalone-plugin}/
```

### 2. Project Directory (`./.claude/`)

Project-specific entities that override or extend global config:

```
{project}/.claude/
├── settings.json                    # Project-level overrides
├── CLAUDE.md                        # Project memory file
├── skills/
├── commands/
├── agents/
└── hooks/
```

### 3. Plugin Directories

Each installed plugin has this structure:

```
{plugin-path}/
├── .claude-plugin/
│   └── plugin.json                  # Plugin manifest
├── skills/
│   └── {skill-name}/
│       └── SKILL.md
├── commands/
├── agents/
├── hooks/
└── [other plugin files]
```

---

## How Data is Sourced

### Marketplace Discovery

**Registry file:** `~/.claude/plugins/known_marketplaces.json`

```json
{
  "claude-code-plugins": {
    "source": {
      "source": "github",
      "repo": "anthropics/claude-code-plugins",
      "owner": "anthropics"
    },
    "installLocation": "/Users/user/.claude/plugins/marketplaces/claude-code-plugins",
    "lastUpdated": "2024-01-15T10:30:00Z"
  }
}
```

**Flow:**
1. Read `known_marketplaces.json` to get list of registered marketplaces
2. For each marketplace, read `{installLocation}/.claude-plugin/marketplace.json`
3. Marketplace manifest lists all available plugins

**Marketplace manifest structure:**
```json
{
  "name": "claude-code-plugins",
  "version": "1.0.0",
  "plugins": [
    {
      "name": "frontend-design",
      "description": "...",
      "source": "./frontend-design",
      "category": "productivity"
    }
  ]
}
```

### Plugin Discovery

**Registry file:** `~/.claude/plugins/installed_plugins.json`

```json
{
  "version": 1,
  "plugins": {
    "frontend-design@claude-code-plugins": {
      "version": "1.0.0",
      "installedAt": "2024-01-10T12:00:00Z",
      "installPath": "/Users/user/.claude/plugins/marketplaces/claude-code-plugins/frontend-design",
      "gitCommitSha": "abc123"
    }
  }
}
```

**Flow:**
1. Discover from marketplaces (read each marketplace manifest)
2. Discover from cache (`~/.claude/plugins/cache/` for standalone plugins)
3. Check `installed_plugins.json` for installation status
4. Check `settings.json` for enabled status

### Settings Management

**Files:** `~/.claude/settings.json` (global) + `./.claude/settings.json` (project)

```json
{
  "enabledPlugins": {
    "frontend-design@claude-code-plugins": true,
    "plugin-dev@claude-code-plugins": false
  }
}
```

**Merge strategy:** Project settings override global settings for the same keys.

**Enabled status determination:**
- `enabledPlugins[id] === false` → disabled
- `enabledPlugins[id] === true` → explicit-enabled
- `enabledPlugins[id] === undefined` → implicit-enabled (default on)

### Entity Loading

**Process for each entity type (skills, commands, agents, hooks):**

1. **Load from user-global:**
   ```
   Source: ~/.claude/{entity-type}/
   EntitySource: { type: "user-global", filePath: "..." }
   ```

2. **Load from project:**
   ```
   Source: ./.claude/{entity-type}/
   EntitySource: { type: "project", filePath: "..." }
   ```

3. **Load from each enabled plugin:**
   ```
   Source: {plugin.installPath}/{entity-type}/
   EntitySource: { type: "plugin", pluginId: "...", filePath: "..." }
   ```

### Memory File (CLAUDE.md) Loading

**Locations searched (in order):**
1. `~/.claude/CLAUDE.md` (scope: user-global)
2. `./.claude/CLAUDE.md` (scope: project)
3. Nested `CLAUDE.md` files in project subdirectories (scope: nested)

**Result:** Flat list of MemoryFile objects ordered by precedence.

---

## Complete Discovery Flow

```
loadAgentContext()
│
├─► loadMemoryFiles()
│   ├── ~/.claude/CLAUDE.md (user-global)
│   ├── ./.claude/CLAUDE.md (project)
│   └── Nested CLAUDE.md files (nested)
│
├─► discoverAllPlugins()
│   ├── Read known_marketplaces.json
│   │   └── For each marketplace:
│   │       └── Read marketplace.json → plugin entries
│   ├── Scan ~/.claude/plugins/cache/ → standalone plugins
│   ├── Check installed_plugins.json → installationStatus
│   └── Check settings.json → enabledStatus
│
├─► loadEntitiesFromUserGlobal()
│   └── ~/.claude/skills/, commands/, agents/, hooks/
│
├─► loadEntitiesFromProject()
│   └── ./.claude/skills/, commands/, agents/, hooks/
│
└─► For each enabled plugin:
    └── loadEntitiesFromPlugin(pluginId)
        └── {plugin.path}/skills/, commands/, agents/, hooks/

Result: AgentContext {
  skills, commands, subagents, hooks,
  mcpServers, memoryFiles, sources
}
```

---

## Entity Source Tracking

Every entity includes source information:

```typescript
interface EntitySource {
  type: "plugin" | "project" | "user-global";
  pluginId?: string;      // Only for type: "plugin"
  filePath: string;       // Absolute path
}
```

**Examples:**

User-global skill:
```json
{
  "type": "user-global",
  "filePath": "/Users/user/.claude/skills/my-skill/SKILL.md"
}
```

Project command:
```json
{
  "type": "project",
  "filePath": "/projects/myapp/.claude/commands/deploy.md"
}
```

Plugin agent:
```json
{
  "type": "plugin",
  "pluginId": "frontend-design@claude-code-plugins",
  "filePath": "/Users/user/.claude/plugins/marketplaces/claude-code-plugins/frontend-design/agents/designer.md"
}
```

---

## Data Model

### Plugin States

```typescript
// Installation status
type PluginInstallationStatus = "available" | "installed";

// Enabled status (computed from settings.json)
type PluginEnabledStatus =
  | "disabled"           // Explicitly false in settings
  | "implicit-enabled"   // No entry in settings (default)
  | "explicit-enabled";  // Explicitly true in settings
```

### Plugin Type

```typescript
interface Plugin {
  id: string;                    // "name@marketplace" or "name"
  name: string;
  description?: string;
  marketplace?: string;

  // Computed states
  installationStatus: PluginInstallationStatus;
  enabledStatus: PluginEnabledStatus;

  // Entity counts (discovery without full load)
  entityCounts: {
    skills: number;
    commands: number;
    agents: number;
    hooks: number;
    mcpServers: number;
  };

  // Only if installed
  installInfo?: {
    path: string;
    installedAt: string;
    version?: string;
    gitCommitSha?: string;
  };
}
```

### Memory Files

```typescript
interface MemoryFile {
  path: string;
  content: string;
  frontmatter?: Record<string, unknown>;
  scope: "user-global" | "project" | "nested";
  relativePath?: string;  // For nested, relative to project
}
```

### AgentContext (Main Composed Type)

```typescript
interface AgentContext {
  id: string;
  name: string;

  // Entities
  skills: Skill[];
  commands: Command[];
  subagents: Agent[];
  hooks: Hook[];

  // Integrations
  mcpServers: McpServerConfig[];

  // Memory/context
  memoryFiles: MemoryFile[];  // Flat list, ordered by precedence

  // Provenance
  sources: {
    projectDir?: string;
    userGlobalDir: string;
    enabledPlugins: string[];
  };
}
```

---

## Method Naming Convention

| Prefix | Purpose | Example |
|--------|---------|---------|
| `discover*` | Metadata/counts only, fast | `discoverAllPlugins()` |
| `load*` | Full parsing with content | `loadSkillsFromPlugin()` |
| `get*` | Cached/memory lookup | `getPlugin()` |

### Key Methods

```typescript
// Plugin Discovery
discoverAllPlugins(): Plugin[]
discoverMarketplacePlugins(marketplace: string): Plugin[]
discoverInstalledPlugins(): Plugin[]

// Entity Loading (explicit sources)
loadSkillsFromEnabledSources(): Skill[]
loadSkillsFromPlugin(pluginId: string): Skill[]
loadSkillsFromProject(): Skill[]
loadSkillsFromUserGlobal(): Skill[]

// Memory Files
loadMemoryFiles(): MemoryFile[]

// Main aggregator
loadAgentContext(): AgentContext

// Cached lookups
getPlugin(pluginId: string): Plugin | undefined
getEnabledPlugins(): Plugin[]
```

---

## Plugin Discovery Flow Diagram

```
discoverAllPlugins()
  │
  ├─► Read known_marketplaces.json
  │     └─► For each marketplace:
  │           └─► Read marketplace.json manifest
  │                 └─► For each plugin entry:
  │                       ├─► Check installed_plugins.json → installationStatus
  │                       ├─► Check settings.json → enabledStatus
  │                       └─► Count entities → entityCounts
  │
  ├─► Scan ~/.claude/plugins/cache/
  │     └─► For each standalone plugin:
  │           └─► Same status checks
  │
  └─► Return Plugin[] with all states computed
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    loadAgentContext()                           │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ User Global   │    │ Project       │    │ Enabled       │
│ ~/.claude/    │    │ ./.claude/    │    │ Plugins       │
└───────────────┘    └───────────────┘    └───────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────────────────────────────────────────────────────┐
│                      AgentContext                              │
│  - skills: Skill[]                                            │
│  - commands: Command[]                                        │
│  - subagents: Agent[]                                         │
│  - hooks: Hook[]                                              │
│  - mcpServers: McpServerConfig[]                              │
│  - memoryFiles: MemoryFile[]                                  │
│  - sources: { projectDir, userGlobalDir, enabledPlugins }     │
└───────────────────────────────────────────────────────────────┘
```
