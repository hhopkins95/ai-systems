// ========== Re-exports from claude-entity-manager ==========
export type {
  // Entity types
  Skill,
  SkillMetadata,
  Command,
  CommandMetadata,
  Agent,
  AgentMetadata,
  Hook,
  HookEvent,
  HookConfig,
  HookMatcher,
  ClaudeConfig,
  EntitySource,
  // CLAUDE.md context types
  ClaudeMdScope,
  ClaudeMdFrontmatter,
  ClaudeMdFile,
  ClaudeMdNode,
  // Plugin types
  Plugin,
  PluginManifest,
  PluginSource,
  MarketplaceManifest,
  MarketplacePlugin,
  McpServerConfig,
  // MCP types
  McpServerWithSource,
  // Registry types
  PluginRegistry,
  InstalledPluginInfo,
  KnownMarketplace,
  KnownMarketplacesRegistry,
  Settings,
} from '@hhopkins/claude-entity-manager';

// ========== Smart-docs specific types ==========

/**
 * Server configuration
 */
export interface ServerConfig {
  docsPath: string;
  projectRoot: string;
  homeDir: string;
}

/**
 * Generic frontmatter for markdown files
 */
export interface Frontmatter {
  title?: string;
  description?: string;
  [key: string]: unknown;
}

/**
 * Markdown file metadata
 */
export interface MarkdownFile {
  /** Relative path to docs root */
  path: string;
  /** Filename */
  name: string;
  /** Title from frontmatter or filename */
  title: string;
}

/**
 * Markdown file with parsed content
 */
export interface MarkdownContent {
  path: string;
  frontmatter: Frontmatter | null;
  content: string;
}

/**
 * Node in a file tree structure
 */
export interface FileTreeNode {
  type: 'file' | 'directory';
  name: string;
  path: string;
  children?: FileTreeNode[];
}

/**
 * File change event types
 */
export type FileEventType = 'add' | 'change' | 'unlink';

/**
 * File change event from watcher
 */
export interface FileChangeEvent {
  area: 'docs' | 'claude' | 'plugins';
  type: FileEventType;
  path: string;
}
