// ==================== ENTITY SOURCE ====================

/**
 * Source information for an entity - where it came from
 */
export interface EntitySource {
  /** The type of source: plugin, project, or global */
  type: "plugin" | "project" | "global";
  /** Plugin ID if from plugin (e.g., "episodic-memory@superpowers-marketplace") */
  pluginId?: string;
  /** Marketplace name if from plugin */
  marketplace?: string;
  /** File path to the entity */
  path: string;
}

// ==================== SKILL ====================

/**
 * Skill metadata from frontmatter
 */
export interface SkillMetadata {
  name?: string;
  description?: string;
  version?: string;
  tags?: string[];
  "allowed-tools"?: string[];
  [key: string]: unknown;
}

/**
 * Skill entity - SKILL.md files with optional bundled resources
 */
export interface Skill {
  /** Skill name (from frontmatter or directory name) */
  name: string;
  /** Full absolute path to SKILL.md */
  path: string;
  /** Source information */
  source: EntitySource;
  /** Skill description from frontmatter */
  description: string;
  /** Version from frontmatter (optional) */
  version?: string;
  /** Raw markdown content (body after frontmatter) */
  content: string;
  /** All frontmatter metadata */
  metadata: SkillMetadata;
  /** List of all files in the skill directory (relative paths) */
  files: string[];
  /** Optional: loaded file contents (if requested) */
  fileContents?: Record<string, string>;
}

// ==================== COMMAND ====================

/**
 * Command metadata from frontmatter
 */
export interface CommandMetadata {
  description?: string;
  agent?: string;
  model?: string;
  "allowed-tools"?: string[];
  [key: string]: unknown;
}

/**
 * Command entity - markdown files in commands/ directory
 */
export interface Command {
  /** Command name (from filename without .md) */
  name: string;
  /** Full absolute path to command file */
  path: string;
  /** Source information */
  source: EntitySource;
  /** Command description from frontmatter or first line */
  description?: string;
  /** Raw markdown content (body after frontmatter) */
  content: string;
  /** All frontmatter metadata */
  metadata: CommandMetadata;
}

// ==================== AGENT ====================

/**
 * Agent metadata from frontmatter
 */
export interface AgentMetadata {
  description?: string;
  model?: string;
  tools?: string[];
  color?: string;
  [key: string]: unknown;
}

/**
 * Agent entity - markdown files in agents/ directory
 */
export interface Agent {
  /** Agent name (from filename without .md) */
  name: string;
  /** Full absolute path to agent file */
  path: string;
  /** Source information */
  source: EntitySource;
  /** Agent description from frontmatter */
  description?: string;
  /** Raw markdown content (system prompt) */
  content: string;
  /** All frontmatter metadata */
  metadata: AgentMetadata;
}

// ==================== HOOK ====================

/**
 * Hook events supported by Claude Code
 */
export type HookEvent =
  | "PreToolUse"
  | "PostToolUse"
  | "Stop"
  | "SubagentStop"
  | "SessionStart"
  | "SessionEnd"
  | "UserPromptSubmit"
  | "PreCompact"
  | "Notification";

/**
 * Single hook configuration
 */
export interface HookConfig {
  type: "command" | "prompt";
  command?: string;
  prompt?: string;
  timeout?: number;
  async?: boolean;
}

/**
 * Hook matcher configuration
 */
export interface HookMatcher {
  matcher?: string;
  hooks: HookConfig[];
}

/**
 * Hook entity - from hooks.json files
 */
export interface Hook {
  /** Hook name (from filename or plugin) */
  name: string;
  /** Full absolute path to hooks.json */
  path: string;
  /** Source information */
  source: EntitySource;
  /** Hook event configurations */
  hooks: Partial<Record<HookEvent, HookMatcher[]>>;
}

// ==================== CLAUDE.MD CONTEXT FILES ====================

/**
 * Scope of a CLAUDE.md file - where it's located
 */
export type ClaudeMdScope = "global" | "project" | "nested";

/**
 * Frontmatter parsed from CLAUDE.md files
 */
export interface ClaudeMdFrontmatter {
  title?: string;
  description?: string;
  [key: string]: unknown;
}

/**
 * CLAUDE.md file information
 */
export interface ClaudeMdFile {
  /** Filename (always "CLAUDE.md") */
  name: string;
  /** Absolute path to the file */
  path: string;
  /** Relative path for display */
  relativePath: string;
  /** Scope: global, project, or nested */
  scope: ClaudeMdScope;
  /** Depth in hierarchy (0=global, 1=project, 2+=nested) */
  level: number;
  /** File content (body after frontmatter) */
  content: string;
  /** Parsed frontmatter, or null if none */
  frontmatter: ClaudeMdFrontmatter | null;
  /** Directory this file applies to */
  directoryPath: string;
}

/**
 * Node in the CLAUDE.md file tree
 */
export interface ClaudeMdNode {
  /** Node type: file or directory */
  type: "file" | "directory";
  /** Display name */
  name: string;
  /** Absolute path */
  path: string;
  /** CLAUDE.md file info (present if type === 'file') */
  file?: ClaudeMdFile;
  /** Child nodes (present if type === 'directory') */
  children?: ClaudeMdNode[];
}

// ==================== AGGREGATED CONFIG ====================

/**
 * Complete Claude Code configuration with all entities
 */
export interface ClaudeConfig {
  skills: Skill[];
  commands: Command[];
  agents: Agent[];
  hooks: Hook[];
}

// ==================== PLUGIN SOURCE ====================

/**
 * Plugin source - where to get the plugin
 */
export type PluginSource =
  | { source: "github"; repo: string }
  | { source: "url"; url: string }
  | { source: "directory"; path: string };

// ==================== PLUGIN MANIFEST ====================

/**
 * Plugin manifest from .claude-plugin/plugin.json
 */
export interface PluginManifest {
  name: string;
  displayName?: string;
  description?: string;
  version?: string;
  author?: string | { name: string; email?: string };
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
  agents?: string[];
  mcpServers?: Record<string, McpServerConfig>;
}

/**
 * MCP Server configuration
 */
export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

// ==================== MARKETPLACE ====================

/**
 * Plugin entry in a marketplace manifest
 */
export interface MarketplacePlugin {
  name: string;
  description?: string;
  version?: string;
  author?: string | { name: string; email?: string };
  source: string | PluginSource;
  category?: string;
  strict?: boolean;
  skills?: string[];
  commands?: string[];
  agents?: string[];
  hooks?: string[];
}

/**
 * Marketplace manifest from .claude-plugin/marketplace.json
 */
export interface MarketplaceManifest {
  $schema?: string;
  name: string;
  version?: string;
  description?: string;
  owner?: {
    name: string;
    email?: string;
  };
  metadata?: {
    description?: string;
    version?: string;
    pluginRoot?: string;
  };
  plugins: MarketplacePlugin[];
}

// ==================== PLUGIN REGISTRY ====================

/**
 * Installed plugin info from installed_plugins.json
 */
export interface InstalledPluginInfo {
  version: string;
  installedAt: string;
  lastUpdated: string;
  installPath: string;
  gitCommitSha?: string;
  isLocal: boolean;
}

/**
 * Plugin registry structure (installed_plugins.json)
 */
export interface PluginRegistry {
  version: number;
  plugins: Record<string, InstalledPluginInfo>;
}

// ==================== KNOWN MARKETPLACES ====================

/**
 * Known marketplace entry from known_marketplaces.json
 */
export interface KnownMarketplace {
  source: PluginSource;
  installLocation: string;
  lastUpdated: string;
}

/**
 * Known marketplaces registry
 */
export type KnownMarketplacesRegistry = Record<string, KnownMarketplace>;

// ==================== SETTINGS ====================

/**
 * Settings structure from settings.json
 */
export interface Settings {
  $schema?: string;
  enabledPlugins?: Record<string, boolean>;
  [key: string]: unknown;
}

// ==================== PLUGIN ====================

/**
 * Full plugin information (aggregated from discovery)
 */
export interface Plugin {
  /** Unique plugin ID: "plugin-name@marketplace-name" or "plugin-name" */
  id: string;
  /** Plugin name */
  name: string;
  /** Marketplace name (if from marketplace) */
  marketplace?: string;
  /** Plugin description */
  description?: string;
  /** Plugin version */
  version?: string;
  /** Plugin source info */
  source: PluginSource;
  /** Absolute path to plugin directory */
  path: string;
  /** Whether plugin is enabled */
  enabled: boolean;
  /** Entity counts */
  skillCount: number;
  commandCount: number;
  agentCount: number;
  hookCount: number;
  /** Has MCP servers */
  hasMcpServers: boolean;
  /** Installation info from registry */
  installInfo?: InstalledPluginInfo;
}

// ==================== INSTALLATION ====================

/**
 * Plugin installation source specification (parsed from string)
 */
export type InstallSource =
  | { type: "github"; owner: string; repo: string }
  | { type: "git"; url: string }
  | { type: "directory"; path: string }
  | { type: "marketplace"; pluginName: string; marketplaceName: string };

/**
 * Installation options
 */
export interface InstallOptions {
  /** Force reinstall if already installed */
  force?: boolean;
  /** Update to latest if already installed */
  update?: boolean;
}

/**
 * Installation result
 */
export interface InstallResult {
  success: boolean;
  pluginId: string;
  installPath: string;
  error?: string;
}

// ==================== SERVICE OPTIONS ====================

/**
 * ClaudeEntityManager constructor options
 */
export interface ClaudeEntityManagerOptions {
  /** Custom Claude config directory (default: ~/.claude) */
  claudeDir?: string;
  /** Project directory for project-local entities */
  projectDir?: string;
  /** Whether to include disabled plugins when loading (default: false) */
  includeDisabled?: boolean;
}
