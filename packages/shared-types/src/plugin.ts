/**
 * Plugin-related types
 */

/**
 * Installation status - whether plugin is available or installed
 */
export type PluginInstallationStatus = "available" | "installed";

/**
 * Enabled status - how the plugin's enabled state was determined
 * - disabled: Explicitly set to false in settings.json
 * - implicit-enabled: No entry in settings (default behavior is enabled)
 * - explicit-enabled: Explicitly set to true in settings.json
 */
export type PluginEnabledStatus =
  | "disabled"
  | "implicit-enabled"
  | "explicit-enabled";

/**
 * Entity counts for a plugin (used in discovery without full load)
 */
export interface EntityCounts {
  skills: number;
  commands: number;
  agents: number;
  hooks: number;
  mcpServers: number;
}

/**
 * Installation info for an installed plugin
 */
export interface PluginInstallInfo {
  /** Semantic version of the plugin */
  version: string;
  /** ISO timestamp when plugin was installed */
  installedAt: string;
  /** ISO timestamp when plugin was last updated */
  lastUpdated: string;
  /** Absolute path where the plugin is installed */
  installPath: string;
  /** Git commit SHA if installed from git */
  gitCommitSha?: string;
  /** Whether this is a local plugin (not from git) */
  isLocal: boolean;
}

/**
 * Plugin source - where the plugin can be installed from
 */
export type PluginSource =
  | { source: "github"; repo: string; owner: string }
  | { source: "url"; url: string }
  | { source: "directory"; path: string };

/**
 * A discovered plugin with all computed states
 */
export interface Plugin {
  /** Unique identifier (e.g., "plugin-name@marketplace" or "plugin-name") */
  id: string;
  /** Display name of the plugin */
  name: string;
  /** Plugin description */
  description?: string;
  /** Marketplace the plugin belongs to (if any) */
  marketplace?: string;
  /** Version string */
  version?: string;

  /** Source for installation */
  source: PluginSource;

  /** Absolute path to plugin directory */
  path: string;

  /** Whether plugin is enabled (computed from settings) */
  enabled: boolean;

  /** Whether the plugin is available or installed */
  installationStatus: PluginInstallationStatus;
  /** How the enabled state was determined */
  enabledStatus: PluginEnabledStatus;

  /** Entity counts - individual properties for backward compat */
  skillCount: number;
  commandCount: number;
  agentCount: number;
  hookCount: number;
  /** Has MCP servers defined */
  hasMcpServers: boolean;

  /** Installation details (only if installed) */
  installInfo?: PluginInstallInfo;
}

/**
 * Marketplace info from known_marketplaces.json
 */
export interface Marketplace {
  /** Name of the marketplace */
  name: string;
  /** Source configuration */
  source: PluginSource;
  /** Where the marketplace is installed locally */
  installLocation: string;
  /** ISO timestamp of last update */
  lastUpdated?: string;
}
