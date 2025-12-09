/**
 * Type definitions for claude-entity-manager
 *
 * Core entity types are imported from @ai-systems/shared-types.
 * This file contains manager-specific types for manifests, registries, and installation.
 */

// Re-export all shared types
export type {
  // Sources
  EntitySource,
  EntitySourceType,

  // Entities
  Skill,
  SkillMetadata,
  SkillFile,
  Command,
  CommandMetadata,
  Agent,
  AgentMetadata,
  Hook,
  HookEvent,
  HookConfig,
  CommandHookConfig,
  PromptHookConfig,
  HookMatcher,
  MemoryFile,
  MemoryFileScope,

  // Plugin
  Plugin,
  PluginInstallationStatus,
  PluginEnabledStatus,
  PluginSource,
  PluginInstallInfo,
  EntityCounts,
  Marketplace,

  // MCP
  McpServerConfig,
  McpEnvVars,
  PluginMcpServer,

  // Agent context
  AgentContext,
  AgentContextSources,
  LoadAgentContextOptions,
} from "../../types/dist/index.js";

// Import types we need for local types
import type {
  EntitySource,
  MemoryFile,
  PluginSource,
  MemoryFileScope,
  McpServerConfig,
} from "../../types/dist/index.js";

// ==================== CLAUDE.MD (INTERNAL) ====================

// /**
//  * Frontmatter parsed from CLAUDE.md files
//  */
export interface ClaudeMdFrontmatter {
  title?: string;
  description?: string;
  [key: string]: unknown;
}

/**
 * CLAUDE.md file information (internal format)
 * Use toMemoryFile() to convert to the shared MemoryFile type
 */
export interface ClaudeMdFile {
  /** Filename (always "CLAUDE.md") */
  name: string;
  /** Absolute path to the file */
  path: string;
  /** Relative path for display */
  relativePath: string;
  /** Scope: global, project, or nested */
  scope: MemoryFileScope;
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
 * Node in the CLAUDE.md file tree (internal representation)
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

/**
 * Convert ClaudeMdFile to MemoryFile (shared type)
 */
export function toMemoryFile(file: ClaudeMdFile): MemoryFile {
  return {
    path: file.path,
    content: file.content,
    frontmatter: file.frontmatter ?? undefined,
    scope: file.scope, // Same values: "global" | "project" | "nested"
    relativePath: file.scope === "nested" ? file.relativePath : undefined,
    depth: file.level,
  };
}

/**
 * Flatten a ClaudeMdNode tree into a sorted array of ClaudeMdFile objects.
 * Files are sorted by precedence: global → project → nested (by level, then path)
 */
export function flattenClaudeMdNodes(nodes: ClaudeMdNode[]): ClaudeMdFile[] {
  const files: ClaudeMdFile[] = [];

  function traverse(node: ClaudeMdNode) {
    if (node.type === "file" && node.file) {
      files.push(node.file);
    }
    if (node.children) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }

  for (const node of nodes) {
    traverse(node);
  }

  // Sort by scope priority: global first, then project, then nested
  const scopeOrder: Record<MemoryFileScope, number> = {
    global: 0,
    project: 1,
    nested: 2,
  };

  files.sort((a, b) => {
    const orderDiff = scopeOrder[a.scope] - scopeOrder[b.scope];
    if (orderDiff !== 0) return orderDiff;
    // For nested files, sort by level then path
    if (a.scope === "nested" && b.scope === "nested") {
      if (a.level !== b.level) return a.level - b.level;
      return a.path.localeCompare(b.path);
    }
    return 0;
  });

  return files;
}

// ==================== AGGREGATED CONFIG (LEGACY) ====================

/**
 * Complete Claude Code configuration with all entities
 * @deprecated Use AgentContext from shared-types
 */
export interface ClaudeConfig {
  skills: import("../../types/dist/index.js").Skill[];
  commands: import("../../types/dist/index.js").Command[];
  agents: import("../../types/dist/index.js").Agent[];
  hooks: import("../../types/dist/index.js").Hook[];
}

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

// ==================== SETTINGS ====================

/**
 * Settings structure from settings.json
 */
export interface Settings {
  $schema?: string;
  enabledPlugins?: Record<string, boolean>;
  [key: string]: unknown;
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

