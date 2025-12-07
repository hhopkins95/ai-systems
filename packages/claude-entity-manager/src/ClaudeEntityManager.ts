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
  AgentContext,
  AgentContextSources,
  LoadAgentContextOptions,
  MemoryFile,
  McpServerConfig,
  PluginMcpServer,
} from "./types.js";
import { toMemoryFile, flattenClaudeMdNodes } from "./types.js";
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
import { EntityWriter, type WriteResult, type WriteEntitiesOptions } from "./installation/EntityWriter.js";

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
  private entityWriter?: EntityWriter;

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
   * Load all entities from enabled sources: global ~/.claude, project .claude, and enabled plugins.
   * This represents the "active" configuration for an agent session.
   */
  async loadEntitiesFromEnabledSources(includeContents = false): Promise<ClaudeConfig> {
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
    // Always pass false to exclude disabled plugins, regardless of constructor setting
    const plugins = await this.pluginDiscovery.discoverPlugins(false);
    for (const plugin of plugins) {
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

    // If plugin has explicit entity paths from marketplace.json, use those
    // Otherwise fall back to scanning the plugin directory
    const [skills, commands, agents, hooks] = await Promise.all([
      plugin.skillPaths
        ? this.skillLoader.loadSkillsFromPaths(
            plugin.path,
            plugin.skillPaths,
            pluginSource,
            includeContents
          )
        : this.skillLoader.loadSkills(
            plugin.path,
            pluginSource,
            includeContents,
            true
          ), // searchRootLevel for plugins
      plugin.commandPaths
        ? this.commandLoader.loadCommandsFromPaths(
            plugin.path,
            plugin.commandPaths,
            pluginSource
          )
        : this.commandLoader.loadCommands(plugin.path, pluginSource),
      plugin.agentPaths
        ? this.agentLoader.loadAgentsFromPaths(
            plugin.path,
            plugin.agentPaths,
            pluginSource
          )
        : this.agentLoader.loadAgents(plugin.path, pluginSource),
      plugin.hookPaths
        ? this.hookLoader.loadHooksFromPaths(
            plugin.path,
            plugin.hookPaths,
            pluginSource
          )
        : this.hookLoader.loadHooks(plugin.path, pluginSource),
    ]);

    return { skills, commands, agents, hooks };
  }

  /**
   * Load entities from a specific directory (searches root level)
   */
  async loadEntitiesFromDirectory(
    dirPath: string,
    includeContents = false
  ): Promise<ClaudeConfig> {
    const source: Omit<EntitySource, "path"> = { type: "global" };

    const [skills, commands, agents, hooks] = await Promise.all([
      this.skillLoader.loadSkills(dirPath, source, includeContents, true), // searchRootLevel
      this.commandLoader.loadCommands(dirPath, source),
      this.agentLoader.loadAgents(dirPath, source),
      this.hookLoader.loadHooks(dirPath, source),
    ]);

    return { skills, commands, agents, hooks };
  }

  /**
   * Load skills from the user's global ~/.claude directory
   */
  async loadSkillsFromUserGlobal(includeContents = false): Promise<Skill[]> {
    const globalSource: Omit<EntitySource, "path"> = { type: "global" };
    return this.skillLoader.loadSkills(this.claudeDir, globalSource, includeContents);
  }

  /**
   * Load skills from the project's .claude directory
   * @throws Error if no project directory is configured
   */
  async loadSkillsFromProject(includeContents = false): Promise<Skill[]> {
    if (!this.projectDir) {
      throw new Error("No project directory configured");
    }
    const projectClaudeDir = getProjectClaudeDir(this.projectDir);
    const projectSource: Omit<EntitySource, "path"> = { type: "project" };
    return this.skillLoader.loadSkills(projectClaudeDir, projectSource, includeContents);
  }

  /**
   * Load skills from a specific plugin
   */
  async loadSkillsFromPlugin(pluginId: string, includeContents = false): Promise<Skill[]> {
    const plugin = await this.pluginDiscovery.getPlugin(pluginId);
    if (!plugin) {
      return [];
    }
    const pluginSource: Omit<EntitySource, "path"> = {
      type: "plugin",
      pluginId: plugin.id,
      marketplace: plugin.marketplace,
    };
    return this.skillLoader.loadSkills(plugin.path, pluginSource, includeContents, true); // searchRootLevel for plugins
  }

  /**
   * Load all commands from enabled sources
   */
  async loadCommands(options?: { pluginId?: string }): Promise<Command[]> {
    if (options?.pluginId) {
      const config = await this.loadPluginEntities(options.pluginId);
      return config.commands;
    }
    const config = await this.loadEntitiesFromEnabledSources();
    return config.commands;
  }

  /**
   * Load all agents from enabled sources
   */
  async loadAgents(options?: { pluginId?: string }): Promise<Agent[]> {
    if (options?.pluginId) {
      const config = await this.loadPluginEntities(options.pluginId);
      return config.agents;
    }
    const config = await this.loadEntitiesFromEnabledSources();
    return config.agents;
  }

  /**
   * Load all hooks from enabled sources
   */
  async loadHooks(options?: { pluginId?: string }): Promise<Hook[]> {
    if (options?.pluginId) {
      const config = await this.loadPluginEntities(options.pluginId);
      return config.hooks;
    }
    const config = await this.loadEntitiesFromEnabledSources();
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

  // ==================== AGENT CONTEXT ====================

  /**
   * Load complete agent context including all entities, MCP servers, and memory files.
   * This is the primary method for getting everything an agent needs to run.
   */
  async loadAgentContext(
    options?: LoadAgentContextOptions
  ): Promise<AgentContext> {
    const {
      projectDir = this.projectDir,
      includeDisabledPlugins = false,
      includeSkillFileContents = false,
    } = options || {};

    // Track which plugins contribute entities
    const enabledPluginIds: string[] = [];

    // Load entities
    const allSkills: Skill[] = [];
    const allCommands: Command[] = [];
    const allAgents: Agent[] = [];
    const allHooks: Hook[] = [];
    const allMcpServers: PluginMcpServer[] = [];

    // Load from global ~/.claude
    const globalSource: Omit<EntitySource, "path"> = { type: "global" };
    const [globalSkills, globalCommands, globalAgents, globalHooks] =
      await Promise.all([
        this.skillLoader.loadSkills(this.claudeDir, globalSource, includeSkillFileContents),
        this.commandLoader.loadCommands(this.claudeDir, globalSource),
        this.agentLoader.loadAgents(this.claudeDir, globalSource),
        this.hookLoader.loadHooks(this.claudeDir, globalSource),
      ]);

    allSkills.push(...globalSkills);
    allCommands.push(...globalCommands);
    allAgents.push(...globalAgents);
    allHooks.push(...globalHooks);

    // Load from project .claude (if projectDir is set)
    if (projectDir) {
      const projectClaudeDir = getProjectClaudeDir(projectDir);
      const projectSource: Omit<EntitySource, "path"> = { type: "project" };

      const [projectSkills, projectCommands, projectAgents, projectHooks] =
        await Promise.all([
          this.skillLoader.loadSkills(projectClaudeDir, projectSource, includeSkillFileContents),
          this.commandLoader.loadCommands(projectClaudeDir, projectSource),
          this.agentLoader.loadAgents(projectClaudeDir, projectSource),
          this.hookLoader.loadHooks(projectClaudeDir, projectSource),
        ]);

      allSkills.push(...projectSkills);
      allCommands.push(...projectCommands);
      allAgents.push(...projectAgents);
      allHooks.push(...projectHooks);
    }

    // Load from plugins
    const plugins = await this.pluginDiscovery.discoverPlugins(includeDisabledPlugins);
    for (const plugin of plugins) {
      if (!includeDisabledPlugins && !plugin.enabled) continue;

      enabledPluginIds.push(plugin.id);

      const pluginSource: Omit<EntitySource, "path"> = {
        type: "plugin",
        pluginId: plugin.id,
        marketplace: plugin.marketplace,
      };

      const [skills, commands, agents, hooks] = await Promise.all([
        this.skillLoader.loadSkills(plugin.path, pluginSource, includeSkillFileContents, true), // searchRootLevel for plugins
        this.commandLoader.loadCommands(plugin.path, pluginSource),
        this.agentLoader.loadAgents(plugin.path, pluginSource),
        this.hookLoader.loadHooks(plugin.path, pluginSource),
      ]);

      allSkills.push(...skills);
      allCommands.push(...commands);
      allAgents.push(...agents);
      allHooks.push(...hooks);

      // Load MCP servers from plugin manifest
      const mcpServers = await this.pluginDiscovery.loadMcpServersFromPlugin(plugin.path);
      // Add pluginId to each MCP server config for provenance
      const mcpServersWithSource: PluginMcpServer[] = mcpServers.map(server => ({
        ...server,
        pluginId: plugin.id,
      }));
      allMcpServers.push(...mcpServersWithSource);
    }

    // Load memory files (CLAUDE.md) and flatten to sorted list
    const claudeMdNodes = await this.loadClaudeMdFiles();
    const claudeMdFiles = flattenClaudeMdNodes(claudeMdNodes);
    const memoryFiles: MemoryFile[] = claudeMdFiles.map(toMemoryFile);

    // Build sources metadata
    const sources: AgentContextSources = {
      projectDir,
      userGlobalDir: this.claudeDir,
      enabledPlugins: enabledPluginIds,
    };

    // Generate context ID and name
    const contextId = `ctx-${Date.now()}`;
    const contextName = projectDir
      ? `Agent Context for ${projectDir.split("/").pop()}`
      : "Global Agent Context";

    return {
      id: contextId,
      name: contextName,
      skills: allSkills,
      commands: allCommands,
      subagents: allAgents, // AgentContext uses "subagents" field name
      hooks: allHooks,
      mcpServers: allMcpServers,
      memoryFiles,
      sources,
    };
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

  // ==================== ENTITY WRITING ====================

  /**
   * Get or create the entity writer for the project directory
   * @throws Error if no project directory is configured
   */
  private getEntityWriter(): EntityWriter {
    if (!this.projectDir) {
      throw new Error("No project directory configured. EntityWriter requires a projectDir.");
    }
    if (!this.entityWriter) {
      this.entityWriter = new EntityWriter(this.projectDir);
    }
    return this.entityWriter;
  }

  /**
   * Write a skill to the project's .claude/skills directory
   * @throws Error if no project directory is configured
   */
  async writeProjectSkill(skill: Skill): Promise<WriteResult> {
    return this.getEntityWriter().writeSkill(skill);
  }

  /**
   * Write a command to the project's .claude/commands directory
   * @throws Error if no project directory is configured
   */
  async writeProjectCommand(command: Command): Promise<WriteResult> {
    return this.getEntityWriter().writeCommand(command);
  }

  /**
   * Write an agent to the project's .claude/agents directory
   * @throws Error if no project directory is configured
   */
  async writeProjectAgent(agent: Agent): Promise<WriteResult> {
    return this.getEntityWriter().writeAgent(agent);
  }

  /**
   * Write a hook to the project's .claude/hooks directory
   * Merges with existing hooks if present
   * @throws Error if no project directory is configured
   */
  async writeProjectHook(hook: Hook): Promise<WriteResult> {
    return this.getEntityWriter().writeHook(hook);
  }

  /**
   * Write CLAUDE.md to the project's .claude directory
   * @throws Error if no project directory is configured
   */
  async writeProjectClaudeMd(content: string): Promise<WriteResult> {
    return this.getEntityWriter().writeClaudeMd(content);
  }

  /**
   * Write multiple entities at once
   * @throws Error if no project directory is configured
   */
  async writeProjectEntities(options: WriteEntitiesOptions): Promise<{
    skills: WriteResult[];
    commands: WriteResult[];
    agents: WriteResult[];
    hooks: WriteResult[];
    claudeMd?: WriteResult;
  }> {
    return this.getEntityWriter().writeEntities(options);
  }
}
