// Import types we need for local types
import type {
  McpServerConfig,
} from "@ai-systems/shared-types";

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

// ==================== INSTALLATION ====================
/**
 * Installation options
 */
export interface PluginInstallOptions {
  /** Force reinstall if already installed */
  force?: boolean;
  /** Update to latest if already installed */
  update?: boolean;
}

/**
 * Installation result
 */
export interface PluginInstallResult {
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
 * Plugin source - where the plugin physically lives (internal type)
 */
export type PluginSource =
  | { type: "github"; repo: string; owner: string }
  | { type: "url"; url: string }
  | { type: "directory"; path: string };

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

  /** Explicit skill paths from marketplace.json (relative to plugin path) */
  skillPaths?: string[];
  /** Explicit command paths from marketplace.json (relative to plugin path) */
  commandPaths?: string[];
  /** Explicit agent paths from marketplace.json (relative to plugin path) */
  agentPaths?: string[];
  /** Explicit hook paths from marketplace.json (relative to plugin path) */
  hookPaths?: string[];

  /** Installation details (only if installed) */
  installInfo?: InstalledPluginInfo;
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
