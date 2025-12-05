import { join } from "path";
import type {
  ClaudeEntityManagerOptions,
  ClaudeConfig,
  Skill,
  Command,
  Agent,
  Hook,
  Plugin,
  PluginRegistry,
  Settings,
  KnownMarketplacesRegistry,
  MarketplaceManifest,
  InstallSource,
  InstallOptions,
  InstallResult,
  PluginSource,
  EntitySource,
  ClaudeMdNode,
} from "./types.js";
import { getClaudeDir, getProjectClaudeDir } from "./utils/paths.js";
import { SkillLoader } from "./loaders/SkillLoader.js";
import { CommandLoader } from "./loaders/CommandLoader.js";
import { AgentLoader } from "./loaders/AgentLoader.js";
import { HookLoader } from "./loaders/HookLoader.js";
import { ClaudeMdLoader } from "./loaders/ClaudeMdLoader.js";
import { PluginDiscovery } from "./discovery/PluginDiscovery.js";
import { PluginRegistryService } from "./registry/PluginRegistry.js";
import { MarketplaceRegistryService } from "./registry/MarketplaceRegistry.js";
import { SettingsManager } from "./registry/SettingsManager.js";
import { PluginInstaller } from "./installation/PluginInstaller.js";
import { SourceParser } from "./installation/SourceParser.js";

/**
 * Main service class for discovering and managing Claude Code entities
 */
export class ClaudeEntityManager {
  private claudeDir: string;
  private projectDir?: string;
  private includeDisabled: boolean;

  // Loaders
  private skillLoader: SkillLoader;
  private commandLoader: CommandLoader;
  private agentLoader: AgentLoader;
  private hookLoader: HookLoader;
  private claudeMdLoader: ClaudeMdLoader;

  // Services
  private pluginDiscovery: PluginDiscovery;
  private pluginRegistry: PluginRegistryService;
  private marketplaceRegistry: MarketplaceRegistryService;
  private settingsManager: SettingsManager;
  private pluginInstaller: PluginInstaller;
  private sourceParser: SourceParser;

  constructor(options: ClaudeEntityManagerOptions = {}) {
    this.claudeDir = getClaudeDir(options.claudeDir);
    this.projectDir = options.projectDir;
    this.includeDisabled = options.includeDisabled || false;

    // Initialize loaders
    this.skillLoader = new SkillLoader();
    this.commandLoader = new CommandLoader();
    this.agentLoader = new AgentLoader();
    this.hookLoader = new HookLoader();
    this.claudeMdLoader = new ClaudeMdLoader();

    // Initialize services
    this.pluginDiscovery = new PluginDiscovery(this.claudeDir, this.projectDir);
    this.pluginRegistry = new PluginRegistryService(this.claudeDir);
    this.marketplaceRegistry = new MarketplaceRegistryService(this.claudeDir);
    this.settingsManager = new SettingsManager(this.claudeDir, this.projectDir);
    this.pluginInstaller = new PluginInstaller(this.claudeDir);
    this.sourceParser = new SourceParser();
  }

  // ==================== ENTITY LOADING ====================

  /**
   * Load all entities from global, project, and enabled plugins
   */
  async loadAllEntities(includeContents = false): Promise<ClaudeConfig> {
    const allSkills: Skill[] = [];
    const allCommands: Command[] = [];
    const allAgents: Agent[] = [];
    const allHooks: Hook[] = [];

    // Load from global ~/.claude
    const globalSource: Omit<EntitySource, "path"> = { type: "global" };
    const [globalSkills, globalCommands, globalAgents, globalHooks] =
      await Promise.all([
        this.skillLoader.loadSkills(this.claudeDir, globalSource, includeContents),
        this.commandLoader.loadCommands(this.claudeDir, globalSource),
        this.agentLoader.loadAgents(this.claudeDir, globalSource),
        this.hookLoader.loadHooks(this.claudeDir, globalSource),
      ]);

    allSkills.push(...globalSkills);
    allCommands.push(...globalCommands);
    allAgents.push(...globalAgents);
    allHooks.push(...globalHooks);

    // Load from project .claude (if projectDir is set)
    if (this.projectDir) {
      const projectClaudeDir = getProjectClaudeDir(this.projectDir);
      const projectSource: Omit<EntitySource, "path"> = { type: "project" };

      const [projectSkills, projectCommands, projectAgents, projectHooks] =
        await Promise.all([
          this.skillLoader.loadSkills(projectClaudeDir, projectSource, includeContents),
          this.commandLoader.loadCommands(projectClaudeDir, projectSource),
          this.agentLoader.loadAgents(projectClaudeDir, projectSource),
          this.hookLoader.loadHooks(projectClaudeDir, projectSource),
        ]);

      allSkills.push(...projectSkills);
      allCommands.push(...projectCommands);
      allAgents.push(...projectAgents);
      allHooks.push(...projectHooks);
    }

    // Load from enabled plugins only
    // Note: discoverPlugins() may return disabled plugins if includeDisabled=true,
    // but loadAllEntities() should always represent the "active" configuration
    const plugins = await this.discoverPlugins();
    for (const plugin of plugins) {
      if (!plugin.enabled) continue;
      const pluginConfig = await this.loadPluginEntities(plugin.id, includeContents);
      allSkills.push(...pluginConfig.skills);
      allCommands.push(...pluginConfig.commands);
      allAgents.push(...pluginConfig.agents);
      allHooks.push(...pluginConfig.hooks);
    }

    return {
      skills: allSkills,
      commands: allCommands,
      agents: allAgents,
      hooks: allHooks,
    };
  }

  /**
   * Load entities from a specific plugin
   */
  async loadPluginEntities(
    pluginId: string,
    includeContents = false
  ): Promise<ClaudeConfig> {
    const plugin = await this.pluginDiscovery.getPlugin(pluginId);
    if (!plugin) {
      return { skills: [], commands: [], agents: [], hooks: [] };
    }

    const pluginSource: Omit<EntitySource, "path"> = {
      type: "plugin",
      pluginId: plugin.id,
      marketplace: plugin.marketplace,
    };

    const [skills, commands, agents, hooks] = await Promise.all([
      this.skillLoader.loadSkills(plugin.path, pluginSource, includeContents),
      this.commandLoader.loadCommands(plugin.path, pluginSource),
      this.agentLoader.loadAgents(plugin.path, pluginSource),
      this.hookLoader.loadHooks(plugin.path, pluginSource),
    ]);

    return { skills, commands, agents, hooks };
  }

  /**
   * Load entities from a specific directory
   */
  async loadEntitiesFromDirectory(
    dirPath: string,
    includeContents = false
  ): Promise<ClaudeConfig> {
    const source: Omit<EntitySource, "path"> = { type: "global" };

    const [skills, commands, agents, hooks] = await Promise.all([
      this.skillLoader.loadSkills(dirPath, source, includeContents),
      this.commandLoader.loadCommands(dirPath, source),
      this.agentLoader.loadAgents(dirPath, source),
      this.hookLoader.loadHooks(dirPath, source),
    ]);

    return { skills, commands, agents, hooks };
  }

  /**
   * Load all skills
   */
  async loadSkills(options?: {
    pluginId?: string;
    includeContents?: boolean;
  }): Promise<Skill[]> {
    if (options?.pluginId) {
      const config = await this.loadPluginEntities(
        options.pluginId,
        options.includeContents
      );
      return config.skills;
    }
    const config = await this.loadAllEntities(options?.includeContents);
    return config.skills;
  }

  /**
   * Load all commands
   */
  async loadCommands(options?: { pluginId?: string }): Promise<Command[]> {
    if (options?.pluginId) {
      const config = await this.loadPluginEntities(options.pluginId);
      return config.commands;
    }
    const config = await this.loadAllEntities();
    return config.commands;
  }

  /**
   * Load all agents
   */
  async loadAgents(options?: { pluginId?: string }): Promise<Agent[]> {
    if (options?.pluginId) {
      const config = await this.loadPluginEntities(options.pluginId);
      return config.agents;
    }
    const config = await this.loadAllEntities();
    return config.agents;
  }

  /**
   * Load all hooks
   */
  async loadHooks(options?: { pluginId?: string }): Promise<Hook[]> {
    if (options?.pluginId) {
      const config = await this.loadPluginEntities(options.pluginId);
      return config.hooks;
    }
    const config = await this.loadAllEntities();
    return config.hooks;
  }

  // ==================== CLAUDE.MD CONTEXT FILES ====================

  /**
   * Load all CLAUDE.md context files from global, project, and nested locations
   * @returns Hierarchical tree of CLAUDE.md nodes
   */
  async loadClaudeMdFiles(): Promise<ClaudeMdNode[]> {
    // Extract home directory from claudeDir (which is ~/.claude)
    const homeDir = join(this.claudeDir, "..");
    return this.claudeMdLoader.loadClaudeMdFiles(homeDir, this.projectDir);
  }

  // ==================== PLUGIN DISCOVERY ====================

  /**
   * Discover all plugins
   */
  async discoverPlugins(): Promise<Plugin[]> {
    return this.pluginDiscovery.discoverPlugins(this.includeDisabled);
  }

  /**
   * Get a specific plugin by ID
   */
  async getPlugin(pluginId: string): Promise<Plugin | null> {
    return this.pluginDiscovery.getPlugin(pluginId);
  }

  /**
   * Get all known marketplaces
   */
  async getMarketplaces(): Promise<KnownMarketplacesRegistry> {
    return this.marketplaceRegistry.getMarketplaces();
  }

  /**
   * Get a marketplace manifest
   */
  async getMarketplaceManifest(
    marketplaceName: string
  ): Promise<MarketplaceManifest | null> {
    const marketplace =
      await this.marketplaceRegistry.getMarketplace(marketplaceName);
    if (!marketplace) return null;
    return this.pluginDiscovery.loadMarketplaceManifest(
      marketplace.installLocation
    );
  }

  // ==================== PLUGIN ENABLE/DISABLE ====================

  /**
   * Check if a plugin is enabled
   */
  async isPluginEnabled(pluginId: string): Promise<boolean> {
    return this.settingsManager.isPluginEnabled(pluginId);
  }

  /**
   * Enable a plugin
   */
  async enablePlugin(pluginId: string): Promise<void> {
    return this.settingsManager.enablePlugin(pluginId);
  }

  /**
   * Disable a plugin
   */
  async disablePlugin(pluginId: string): Promise<void> {
    return this.settingsManager.disablePlugin(pluginId);
  }

  /**
   * Toggle a plugin's enabled state
   */
  async togglePlugin(pluginId: string): Promise<boolean> {
    return this.settingsManager.togglePlugin(pluginId);
  }

  /**
   * Get all enabled plugin states
   */
  async getEnabledPlugins(): Promise<Record<string, boolean>> {
    return this.settingsManager.getPluginStates();
  }

  // ==================== PLUGIN INSTALLATION ====================

  /**
   * Parse an install source string
   */
  parseInstallSource(source: string): InstallSource {
    return this.sourceParser.parse(source);
  }

  /**
   * Install a plugin
   */
  async installPlugin(
    source: string | InstallSource,
    options?: InstallOptions
  ): Promise<InstallResult> {
    return this.pluginInstaller.install(source, options);
  }

  /**
   * Install a marketplace
   */
  async installMarketplace(
    source: string | PluginSource,
    name: string
  ): Promise<InstallResult> {
    return this.pluginInstaller.installMarketplace(source, name);
  }

  /**
   * Uninstall a plugin
   */
  async uninstallPlugin(pluginId: string): Promise<void> {
    return this.pluginInstaller.uninstall(pluginId);
  }

  /**
   * Update a plugin
   */
  async updatePlugin(pluginId: string): Promise<InstallResult> {
    return this.pluginInstaller.update(pluginId);
  }

  /**
   * Update all plugins
   */
  async updateAllPlugins(): Promise<InstallResult[]> {
    const plugins = await this.discoverPlugins();
    const results: InstallResult[] = [];

    for (const plugin of plugins) {
      if (plugin.installInfo && !plugin.installInfo.isLocal) {
        const result = await this.updatePlugin(plugin.id);
        results.push(result);
      }
    }

    return results;
  }

  // ==================== REGISTRY ACCESS ====================

  /**
   * Get the plugin registry
   */
  async getPluginRegistry(): Promise<PluginRegistry> {
    return this.pluginRegistry.getRegistry();
  }

  /**
   * Get settings
   */
  async getSettings(): Promise<Settings> {
    return this.settingsManager.getSettings();
  }

  /**
   * Update settings
   */
  async updateSettings(settings: Partial<Settings>): Promise<void> {
    const current = await this.settingsManager.getSettings();
    const updated = { ...current, ...settings };

    if (settings.enabledPlugins) {
      updated.enabledPlugins = {
        ...current.enabledPlugins,
        ...settings.enabledPlugins,
      };
    }

    // Write through settings manager - need to implement
    for (const [pluginId, enabled] of Object.entries(
      settings.enabledPlugins || {}
    )) {
      if (enabled) {
        await this.settingsManager.enablePlugin(pluginId);
      } else {
        await this.settingsManager.disablePlugin(pluginId);
      }
    }
  }
}
