// Main exports
export { ClaudeEntityManager } from "./ClaudeEntityManager.js";

// Type exports
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
  // Agent context types
  AgentContext,
  AgentContextSources,
  LoadAgentContextOptions,
  // Memory file types
  MemoryFile,
  MemoryFileScope,
  // CLAUDE.md context types (internal)
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
  PluginMcpServer,
  // Registry types
  PluginRegistry,
  InstalledPluginInfo,
  KnownMarketplace,
  KnownMarketplacesRegistry,
  Settings,
  // Installation types
  InstallSource,
  InstallOptions,
  InstallResult,
  // Service options
  ClaudeEntityManagerOptions,
} from "./types.js";

// Helper function exports
export { toMemoryFile, flattenClaudeMdNodes } from "./types.js";

// Service exports for advanced usage
export { SkillLoader } from "./loaders/SkillLoader.js";
export { CommandLoader } from "./loaders/CommandLoader.js";
export { AgentLoader } from "./loaders/AgentLoader.js";
export { HookLoader } from "./loaders/HookLoader.js";
export { ClaudeMdLoader } from "./loaders/ClaudeMdLoader.js";
export { MCPLoader, type McpJsonConfig, type McpServerWithSource } from "./loaders/MCPLoader.js";

export { PluginDiscovery } from "./discovery/PluginDiscovery.js";
export { EntityDiscovery, type EntityCounts } from "./discovery/EntityDiscovery.js";

export { PluginRegistryService } from "./registry/PluginRegistry.js";
export { MarketplaceRegistryService } from "./registry/MarketplaceRegistry.js";
export { SettingsManager } from "./registry/SettingsManager.js";

export { PluginInstaller } from "./installation/PluginInstaller.js";
export { SourceParser } from "./installation/SourceParser.js";
export { EntityWriter, type WriteResult, type WriteEntitiesOptions } from "./installation/EntityWriter.js";

// Utility exports
export * from "./utils/paths.js";
export * from "./utils/frontmatter.js";
