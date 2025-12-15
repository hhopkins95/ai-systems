// ========== Re-exports from claude-entity-manager ==========
export type {
  // Plugin types
  PluginManifest,
  MarketplaceManifest,
  MarketplacePlugin,
  Plugin,
  PluginSource,
  // Registry types
  PluginRegistry,
  InstalledPluginInfo,
  KnownMarketplace,
  KnownMarketplacesRegistry,
  // Session types
  SessionMetadata,
  ProjectInfo,
} from '@hhopkins/claude-entity-manager';

// ========== Re-exports from shared-types ==========
export type {
  // Entity types
  Skill,
  SkillMetadata,
  SkillWithSource,
  Command,
  CommandMetadata,
  CommandWithSource,
  Agent,
  AgentMetadata,
  AgentWithSource,
  Hook,
  HookEvent,
  HookConfig,
  HookMatcher,
  HookWithSource,
  EntitySource,
  // Rule types
  Rule,
  RuleMetadata,
  RuleWithSource,
  // MCP types
  McpServerWithSource,
  McpServerConfig,
  // Config types
  ClaudeSettings,
  // Agent context (replaces ClaudeConfig)
  AgentContext,
  // Transcript types
  ParsedTranscript,
  ConversationBlock,
  UserMessageBlock,
  AssistantTextBlock,
  ToolUseBlock,
  ToolResultBlock,
  ThinkingBlock,
  SystemBlock,
  SubagentBlock,
  ErrorBlock,
} from '@ai-systems/shared-types';

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
