// Import types we need for local types
import type {
  PluginSource,
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
 * Plugin installation source specification (parsed from string)
 */
export type PluginInstallSource =
  // | { type: "github"; owner: string; repo: string }
  // | { type: "git"; url: string }
  // | { type: "directory"; path: string }
  PluginSource | { type: "marketplace"; pluginName: string; marketplaceName: string };


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

