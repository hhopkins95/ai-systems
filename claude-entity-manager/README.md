# @hhopkins/claude-entity-manager

A unified service for discovering, loading, and managing Claude Code entities (skills, commands, agents, hooks) and plugins.

## Installation

```bash
npm install @hhopkins/claude-entity-manager
```

## Quick Start

```typescript
import { ClaudeEntityManager } from "@hhopkins/claude-entity-manager";

const manager = new ClaudeEntityManager({
  projectDir: process.cwd(),
});

// Load all entities from enabled plugins
const config = await manager.loadAllEntities();
console.log(`Found ${config.skills.length} skills`);
console.log(`Found ${config.commands.length} commands`);
console.log(`Found ${config.agents.length} agents`);
console.log(`Found ${config.hooks.length} hooks`);
```

## Features

- **Load entities** from global `~/.claude/`, project `./.claude/`, and enabled plugins
- **Discover plugins** from marketplaces, cache, and registry
- **Skills collections support** - marketplaces with skills at root level (like `anthropic-agent-skills`)
- **Read/write plugin states** (enable/disable via settings.json)
- **Install plugins/marketplaces** from GitHub, git URLs, or local directories
- **Aggregate entities** respecting plugin enable/disable states

## API

### Constructor Options

```typescript
interface ClaudeEntityManagerOptions {
  /** Custom Claude config directory (default: ~/.claude) */
  claudeDir?: string;
  /** Project directory for project-local entities */
  projectDir?: string;
  /** Whether to include disabled plugins (default: false) */
  includeDisabled?: boolean;
}
```

### Entity Loading

```typescript
// Load all entities
const config = await manager.loadAllEntities();

// Load from specific plugin
const pluginConfig = await manager.loadPluginEntities("plugin-name@marketplace");

// Load specific entity types
const skills = await manager.loadSkills();
const commands = await manager.loadCommands();
const agents = await manager.loadAgents();
const hooks = await manager.loadHooks();

// Filter by plugin
const pluginSkills = await manager.loadSkills({ pluginId: "plugin@marketplace" });
```

### Plugin Discovery

```typescript
// Discover all plugins
const plugins = await manager.discoverPlugins();

// Get specific plugin
const plugin = await manager.getPlugin("plugin-name@marketplace");

// Get marketplaces
const marketplaces = await manager.getMarketplaces();
```

### Plugin Enable/Disable

```typescript
// Check status
const enabled = await manager.isPluginEnabled("plugin@marketplace");

// Enable/disable
await manager.enablePlugin("plugin@marketplace");
await manager.disablePlugin("plugin@marketplace");

// Toggle
const newState = await manager.togglePlugin("plugin@marketplace");
```

### Plugin Installation

```typescript
// Install from various sources
await manager.installPlugin("owner/repo"); // GitHub short format
await manager.installPlugin("https://github.com/owner/repo"); // GitHub URL
await manager.installPlugin("./local/path"); // Local directory
await manager.installPlugin("plugin@marketplace"); // From marketplace

// With options
await manager.installPlugin("owner/repo", { force: true }); // Force reinstall
await manager.installPlugin("owner/repo", { update: true }); // Update existing

// Install marketplace
await manager.installMarketplace("owner/repo", "marketplace-name");

// Update plugins
await manager.updatePlugin("plugin@marketplace");
await manager.updateAllPlugins();

// Uninstall
await manager.uninstallPlugin("plugin@marketplace");
```

### Registry Access

```typescript
// Get registries
const registry = await manager.getPluginRegistry();
const settings = await manager.getSettings();
```

## Entity Types

### Skill

```typescript
interface Skill {
  name: string;
  path: string;
  source: EntitySource;
  description: string;
  version?: string;
  content: string;
  metadata: SkillMetadata;
  files: string[];
  fileContents?: Record<string, string>;
}
```

### Command

```typescript
interface Command {
  name: string;
  path: string;
  source: EntitySource;
  description?: string;
  content: string;
  metadata: CommandMetadata;
}
```

### Agent

```typescript
interface Agent {
  name: string;
  path: string;
  source: EntitySource;
  description?: string;
  content: string;
  metadata: AgentMetadata;
}
```

### Hook

```typescript
interface Hook {
  name: string;
  path: string;
  source: EntitySource;
  hooks: Partial<Record<HookEvent, HookMatcher[]>>;
}
```

### Plugin

```typescript
interface Plugin {
  id: string; // "plugin-name@marketplace" or "plugin-name"
  name: string;
  marketplace?: string;
  description?: string;
  version?: string;
  source: PluginSource;
  path: string;
  enabled: boolean;
  skillCount: number;
  commandCount: number;
  agentCount: number;
  hookCount: number;
  hasMcpServers: boolean;
  installInfo?: InstalledPluginInfo;
}
```

## File Locations

| File | Purpose |
|------|---------|
| `~/.claude/plugins/installed_plugins.json` | Plugin registry |
| `~/.claude/plugins/known_marketplaces.json` | Marketplace registry |
| `~/.claude/settings.json` | Global settings (plugin enable/disable) |
| `./.claude/settings.json` | Project settings (overrides global) |
| `~/.claude/skills/*/SKILL.md` | Global skills |
| `~/.claude/commands/*.md` | Global commands |
| `~/.claude/agents/*.md` | Global agents |
| `~/.claude/hooks/*.json` | Global hooks |

## License

MIT
