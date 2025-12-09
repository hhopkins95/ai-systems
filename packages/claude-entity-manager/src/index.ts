// Main exports
export { ClaudeEntityManager } from "./ClaudeEntityManager.js";

// Type exports
export type {
  // Plugin types
  PluginManifest,
  MarketplaceManifest,
  MarketplacePlugin,

  // Registry types
  PluginRegistry,
  InstalledPluginInfo,
  KnownMarketplace,
  KnownMarketplacesRegistry,
  // Installation types
  PluginInstallSource as InstallSource,
  PluginInstallOptions as InstallOptions,
  PluginInstallResult as InstallResult,
  // Service options
  ClaudeEntityManagerOptions,
} from "./types.js";

// Service exports for advanced usage
export { SkillLoader } from "./loaders/SkillLoader.js";
export { CommandLoader } from "./loaders/CommandLoader.js";
export { AgentLoader } from "./loaders/AgentLoader.js";
export { HookLoader } from "./loaders/HookLoader.js";
export { ClaudeMdLoader } from "./loaders/ClaudeMdLoader.js";
export { MCPLoader } from "./loaders/MCPLoader.js";

export { PluginDiscovery } from "./discovery/PluginDiscovery.js";
export { EntityDiscovery, type EntityCounts } from "./discovery/EntityDiscovery.js";

export { PluginRegistryService } from "./registry/PluginRegistry.js";
export { MarketplaceRegistryService } from "./registry/MarketplaceRegistry.js";
export { SettingsManager } from "./registry/SettingsManager.js";

export { PluginInstaller } from "./installation/PluginInstaller.js";
export { SourceParser } from "./installation/SourceParser.js";
export { EntityWriter, type WriteResult, type WriteEntitiesOptions, type McpServerInput } from "./installation/EntityWriter.js";

// Utility exports
export * from "./utils/paths.js";
export * from "./utils/frontmatter.js";
