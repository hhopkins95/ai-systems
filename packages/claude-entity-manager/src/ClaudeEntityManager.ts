import type {
  Agent,
  AgentContext,
  AgentContextSources,
  ClaudePluginInstallSource,
  ClaudePluginMarketplaceSource,
  ClaudeSettings,
  Command,
  EntitySource,
  Hook,
  LoadAgentContextOptions,
  McpServerWithSource,
  Rule,
  RuleWithSource,
  Skill
} from "@ai-systems/shared-types";
import { join } from "path";
import { PluginDiscovery } from "./discovery/PluginDiscovery.js";
import { EntityWriter, type McpServerInput, type WriteEntitiesOptions, type WriteResult } from "./installation/EntityWriter.js";
import { PluginInstaller } from "./installation/PluginInstaller.js";
import { AgentLoader } from "./loaders/AgentLoader.js";
import { CommandLoader } from "./loaders/CommandLoader.js";
import { HookLoader } from "./loaders/HookLoader.js";
import { MCPLoader } from "./loaders/MCPLoader.js";
import { RulesLoader } from "./loaders/RulesLoader.js";
import { SessionLoader, type ParsedJsonlTranscript, type ProjectInfo, type ReadSessionOptions, type SessionMetadata } from "./loaders/SessionLoader.js";
import { SkillLoader } from "./loaders/SkillLoader.js";
import { MarketplaceRegistryService } from "./registry/MarketplaceRegistry.js";
import { PluginRegistryService } from "./registry/PluginRegistry.js";
import { SettingsManager } from "./registry/SettingsManager.js";
import type { ClaudeEntityManagerOptions, EntityScope, KnownMarketplacesRegistry, MarketplaceManifest, Plugin, PluginInstallOptions, PluginInstallResult, PluginRegistry } from "./types.js";
import { getClaudeDir, getProjectClaudeDir } from "./utils/paths.js";

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
  private rulesLoader: RulesLoader;
  private mcpLoader: MCPLoader;
  private sessionLoader: SessionLoader;

  // Services
  private pluginDiscovery: PluginDiscovery;
  private pluginRegistry: PluginRegistryService;
  private marketplaceRegistry: MarketplaceRegistryService;
  private settingsManager: SettingsManager;
  private pluginInstaller: PluginInstaller;
  private globalEntityWriter?: EntityWriter;
  private projectEntityWriter?: EntityWriter;

  constructor(options: ClaudeEntityManagerOptions = {}) {
    this.claudeDir = getClaudeDir(options.claudeDir);
    this.projectDir = options.projectDir;
    this.includeDisabled = options.includeDisabled || false;

    // Initialize loaders
    this.skillLoader = new SkillLoader();
    this.commandLoader = new CommandLoader();
    this.agentLoader = new AgentLoader();
    this.hookLoader = new HookLoader();
    this.rulesLoader = new RulesLoader();
    this.mcpLoader = new MCPLoader();
    this.sessionLoader = new SessionLoader(this.claudeDir);

    // Initialize services
    this.pluginDiscovery = new PluginDiscovery(this.claudeDir, this.projectDir);
    this.pluginRegistry = new PluginRegistryService(this.claudeDir);
    this.marketplaceRegistry = new MarketplaceRegistryService(this.claudeDir);
    this.settingsManager = new SettingsManager(this.claudeDir, this.projectDir);
    this.pluginInstaller = new PluginInstaller(this.claudeDir);
  }

  // ==================== ENTITY LOADING ====================

  /**
   * Load all entities from enabled sources: global ~/.claude, project .claude, and enabled plugins.
   * This represents the "active" configuration for an agent session.
   */
  async loadEntitiesFromEnabledSources(includeContents = false): Promise<{
    skills: Skill[];
    commands: Command[];
    subagents: Agent[];
    hooks: Hook[];
    mcpServers: McpServerWithSource[];
  }> {
    const allSkills: Skill[] = [];
    const allCommands: Command[] = [];
    const allSubagents: Agent[] = [];
    const allHooks: Hook[] = [];
    const allMcpServers: McpServerWithSource[] = [];

    // Load from global ~/.claude
    const globalSource: Omit<EntitySource, "path"> = { type: "global" };
    const [globalSkills, globalCommands, globalAgents, globalHooks, globalMcps] =
      await Promise.all([
        this.skillLoader.loadSkills(this.claudeDir, globalSource, includeContents),
        this.commandLoader.loadCommands(this.claudeDir, globalSource),
        this.agentLoader.loadAgents(this.claudeDir, globalSource),
        this.hookLoader.loadHooks(this.claudeDir, globalSource),
        this.mcpLoader.loadMcpServers(this.claudeDir, globalSource),
      ]);

    allSkills.push(...globalSkills);
    allCommands.push(...globalCommands);
    allSubagents.push(...globalAgents);
    allHooks.push(...globalHooks);
    allMcpServers.push(...globalMcps);

    // Load from project .claude (if projectDir is set)
    if (this.projectDir) {
      const projectClaudeDir = getProjectClaudeDir(this.projectDir);
      const projectSource: Omit<EntitySource, "path"> = { type: "project" };

      const [projectSkills, projectCommands, projectAgents, projectHooks, projectMcps] =
        await Promise.all([
          this.skillLoader.loadSkills(projectClaudeDir, projectSource, includeContents),
          this.commandLoader.loadCommands(projectClaudeDir, projectSource),
          this.agentLoader.loadAgents(projectClaudeDir, projectSource),
          this.hookLoader.loadHooks(projectClaudeDir, projectSource),
          this.mcpLoader.loadMcpServers(projectClaudeDir, projectSource),
        ]);

      allSkills.push(...projectSkills);
      allCommands.push(...projectCommands);
      allSubagents.push(...projectAgents);
      allHooks.push(...projectHooks);
      allMcpServers.push(...projectMcps);
    }

    // Load from enabled plugins only
    // Always pass false to exclude disabled plugins, regardless of constructor setting
    const plugins = await this.pluginDiscovery.discoverPlugins(false);
    for (const plugin of plugins) {
      const pluginConfig = await this.loadPluginEntities(plugin.id, includeContents);
      allSkills.push(...pluginConfig.skills);
      allCommands.push(...pluginConfig.commands);
      allSubagents.push(...pluginConfig.subagents);
      allHooks.push(...pluginConfig.hooks);
      allMcpServers.push(...pluginConfig.mcpServers);
    }

    return {
      skills: allSkills,
      commands: allCommands,
      subagents: allSubagents,
      hooks: allHooks,
      mcpServers: allMcpServers,
    };
  }

  /**
   * Load entities from a specific plugin
   */
  async loadPluginEntities(
    pluginId: string,
    includeContents = false
  ): Promise<{
    skills: Skill[];
    commands: Command[];
    subagents: Agent[];
    hooks: Hook[];
    mcpServers: McpServerWithSource[];
  }> {
    const plugin = await this.pluginDiscovery.getPlugin(pluginId);
    if (!plugin) {
      return { skills: [], commands: [], subagents: [], hooks: [], mcpServers: [] };
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

    // Load MCP servers from plugin (both manifest and .mcp.json)
    const pluginMcpSource: Omit<EntitySource, "path"> & { pluginId: string } = {
      type: "plugin",
      pluginId: plugin.id,
    };
    const [manifestMcps, mcpJsonMcps] = await Promise.all([
      this.mcpLoader.loadMcpServersFromPlugin(plugin.path, pluginMcpSource),
      this.mcpLoader.loadMcpServersFromPluginMcpJson(plugin.path, pluginMcpSource),
    ]);
    // Combine, with .mcp.json taking precedence over manifest by server name
    const pluginMcpMap = new Map<string, McpServerWithSource>();
    for (const mcp of manifestMcps) {
      pluginMcpMap.set(mcp.name, mcp);
    }
    for (const mcp of mcpJsonMcps) {
      pluginMcpMap.set(mcp.name, mcp);
    }
    const mcpServers = [...pluginMcpMap.values()];

    return { skills, commands, subagents: agents, hooks, mcpServers };
  }

  /**
   * Load entities from a specific directory (searches root level)
   */
  async loadEntitiesFromDirectory(
    dirPath: string,
    includeContents = false
  ): Promise<{
    skills: Skill[];
    commands: Command[];
    subagents: Agent[];
    hooks: Hook[];
    mcpServers: McpServerWithSource[];
  }> {
    const source: Omit<EntitySource, "path"> = { type: "global" };

    const [skills, commands, agents, hooks, mcpServers] = await Promise.all([
      this.skillLoader.loadSkills(dirPath, source, includeContents, true), // searchRootLevel
      this.commandLoader.loadCommands(dirPath, source),
      this.agentLoader.loadAgents(dirPath, source),
      this.hookLoader.loadHooks(dirPath, source),
      this.mcpLoader.loadMcpServers(dirPath, source),
    ]);

    return { skills, commands, subagents: agents, hooks, mcpServers };
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
      return config.subagents;
    }
    const config = await this.loadEntitiesFromEnabledSources();
    return config.subagents;
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

  /**
   * Load all MCP servers from enabled sources
   */
  async loadMcpServers(options?: { pluginId?: string }): Promise<McpServerWithSource[]> {
    if (options?.pluginId) {
      const config = await this.loadPluginEntities(options.pluginId);
      return config.mcpServers;
    }
    const config = await this.loadEntitiesFromEnabledSources();
    return config.mcpServers;
  }

  // ==================== RULES (CLAUDE.MD AND RULES DIRECTORY) ====================

  /**
   * Load all rule files from global and project locations (CLAUDE.md and rules/*.md)
   * @returns Sorted array of RuleWithSource objects (global first, then project)
   */
  async loadRules(): Promise<RuleWithSource[]> {
    // Extract home directory from claudeDir (which is ~/.claude)
    const homeDir = join(this.claudeDir, "..");
    return this.rulesLoader.loadRules(homeDir, this.projectDir);
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
    const allMcpServers: McpServerWithSource[] = [];

    // Load from global ~/.claude
    const globalSource: Omit<EntitySource, "path"> = { type: "global" };
    const [globalSkills, globalCommands, globalAgents, globalHooks, globalMcps] =
      await Promise.all([
        this.skillLoader.loadSkills(this.claudeDir, globalSource, includeSkillFileContents),
        this.commandLoader.loadCommands(this.claudeDir, globalSource),
        this.agentLoader.loadAgents(this.claudeDir, globalSource),
        this.hookLoader.loadHooks(this.claudeDir, globalSource),
        this.mcpLoader.loadMcpServers(this.claudeDir, globalSource),
      ]);

    allSkills.push(...globalSkills);
    allCommands.push(...globalCommands);
    allAgents.push(...globalAgents);
    allHooks.push(...globalHooks);
    allMcpServers.push(...globalMcps);

    // Load from project .claude (if projectDir is set)
    if (projectDir) {
      const projectClaudeDir = getProjectClaudeDir(projectDir);
      const projectSource: Omit<EntitySource, "path"> = { type: "project" };

      const [projectSkills, projectCommands, projectAgents, projectHooks, projectMcps] =
        await Promise.all([
          this.skillLoader.loadSkills(projectClaudeDir, projectSource, includeSkillFileContents),
          this.commandLoader.loadCommands(projectClaudeDir, projectSource),
          this.agentLoader.loadAgents(projectClaudeDir, projectSource),
          this.hookLoader.loadHooks(projectClaudeDir, projectSource),
          this.mcpLoader.loadMcpServers(projectClaudeDir, projectSource),
        ]);

      allSkills.push(...projectSkills);
      allCommands.push(...projectCommands);
      allAgents.push(...projectAgents);
      allHooks.push(...projectHooks);
      allMcpServers.push(...projectMcps);
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

      // Load MCP servers from plugin (both manifest and .mcp.json)
      const pluginMcpSource: Omit<EntitySource, "path"> & { pluginId: string } = {
        type: "plugin",
        pluginId: plugin.id,
      };
      const [manifestMcps, mcpJsonMcps] = await Promise.all([
        this.mcpLoader.loadMcpServersFromPlugin(plugin.path, pluginMcpSource),
        this.mcpLoader.loadMcpServersFromPluginMcpJson(plugin.path, pluginMcpSource),
      ]);
      // Combine, with .mcp.json taking precedence over manifest by server name
      const pluginMcpMap = new Map<string, McpServerWithSource>();
      for (const mcp of manifestMcps) {
        pluginMcpMap.set(mcp.name, mcp);
      }
      for (const mcp of mcpJsonMcps) {
        pluginMcpMap.set(mcp.name, mcp);
      }
      allMcpServers.push(...pluginMcpMap.values());
    }

    // Load rules (CLAUDE.md and rules/*.md)
    const rules = await this.loadRules();

    // Build sources metadata
    const sources: AgentContextSources = {
      projectDir,
      userGlobalDir: this.claudeDir,
      enabledPlugins: enabledPluginIds,
    };

    return {
      skills: allSkills,
      commands: allCommands,
      subagents: allAgents,
      hooks: allHooks,
      mcpServers: allMcpServers,
      rules,
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
   * Install a plugin
   */
  async installPlugin(
    source: ClaudePluginInstallSource,
  ): Promise<void> {
    return this.pluginInstaller.install(source);
  }

  /**
   * Install a marketplace
   */
  async installMarketplace(
    source: ClaudePluginMarketplaceSource,
  ): Promise<void> {
    return this.pluginInstaller.installMarketplace(source);
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
  async updatePlugin(pluginId: string): Promise<void> {
    return this.pluginInstaller.update(pluginId);
  }

  /**
   * Update all plugins
   */
  async updateAllPlugins(): Promise<void> {
    const plugins = await this.discoverPlugins();
    for (const plugin of plugins) {
      if (plugin.installInfo && !plugin.installInfo.isLocal) {
        await this.updatePlugin(plugin.id);
      }
    }
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
  async getSettings(): Promise<ClaudeSettings> {
    return this.settingsManager.getSettings();
  }

  /**
   * Update settings
   */
  async updateSettings(settings: Partial<ClaudeSettings>): Promise<void> {
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
   * Get or create the entity writer for the specified scope
   * @param scope - 'global' for ~/.claude, 'project' for project/.claude (default: 'project')
   * @throws Error if scope is 'project' but no project directory is configured
   */
  private getEntityWriterForScope(scope: EntityScope = 'project'): EntityWriter {
    if (scope === 'global') {
      if (!this.globalEntityWriter) {
        this.globalEntityWriter = new EntityWriter(this.claudeDir);
      }
      return this.globalEntityWriter;
    }

    // project scope
    if (!this.projectDir) {
      throw new Error("No project directory configured. Project-scope writes require a projectDir.");
    }
    if (!this.projectEntityWriter) {
      this.projectEntityWriter = new EntityWriter(getProjectClaudeDir(this.projectDir));
    }
    return this.projectEntityWriter;
  }

  /**
   * Write a skill to the .claude/skills directory
   * @param skill - The skill to write
   * @param options - Optional scope (default: 'project')
   * @throws Error if scope is 'project' but no project directory is configured
   */
  async writeSkill(skill: Skill, options?: { scope?: EntityScope }): Promise<WriteResult> {
    return this.getEntityWriterForScope(options?.scope).writeSkill(skill);
  }

  /**
   * Write a command to the .claude/commands directory
   * @param command - The command to write
   * @param options - Optional scope (default: 'project')
   * @throws Error if scope is 'project' but no project directory is configured
   */
  async writeCommand(command: Command, options?: { scope?: EntityScope }): Promise<WriteResult> {
    return this.getEntityWriterForScope(options?.scope).writeCommand(command);
  }

  /**
   * Write an agent to the .claude/agents directory
   * @param agent - The agent to write
   * @param options - Optional scope (default: 'project')
   * @throws Error if scope is 'project' but no project directory is configured
   */
  async writeAgent(agent: Agent, options?: { scope?: EntityScope }): Promise<WriteResult> {
    return this.getEntityWriterForScope(options?.scope).writeAgent(agent);
  }

  /**
   * Write a hook to the .claude/hooks directory
   * Merges with existing hooks if present
   * @param hook - The hook to write
   * @param options - Optional scope (default: 'project')
   * @throws Error if scope is 'project' but no project directory is configured
   */
  async writeHook(hook: Hook, options?: { scope?: EntityScope }): Promise<WriteResult> {
    return this.getEntityWriterForScope(options?.scope).writeHook(hook);
  }

  /**
   * Write CLAUDE.md to the .claude directory
   * @param content - The markdown content to write
   * @param options - Optional scope (default: 'project')
   * @throws Error if scope is 'project' but no project directory is configured
   */
  async writeClaudeMd(content: string, options?: { scope?: EntityScope }): Promise<WriteResult> {
    return this.getEntityWriterForScope(options?.scope).writeClaudeMd(content);
  }

  /**
   * Write MCP servers to .claude/.mcp.json
   * Merges with existing config (new servers overwrite by name)
   * Supports both stdio and http server types
   * @param servers - The MCP server configurations to write
   * @param options - Optional scope (default: 'project')
   * @throws Error if scope is 'project' but no project directory is configured
   */
  async writeMcpServers(servers: McpServerInput[], options?: { scope?: EntityScope }): Promise<WriteResult> {
    return this.getEntityWriterForScope(options?.scope).writeMcpServers(servers);
  }

  /**
   * Write multiple entities at once
   * @param options - Entities to write and optional scope (default: 'project')
   * @throws Error if scope is 'project' but no project directory is configured
   */
  async writeEntities(options: WriteEntitiesOptions & { scope?: EntityScope }): Promise<{
    skills: WriteResult[];
    commands: WriteResult[];
    agents: WriteResult[];
    hooks: WriteResult[];
    claudeMd?: WriteResult;
  }> {
    const { scope, ...entityOptions } = options;
    return this.getEntityWriterForScope(scope).writeEntities(entityOptions);
  }

  /**
   * Write a rule to the rules directory
   * @param name - Rule name (without .md extension)
   * @param content - Markdown content
   * @param options - Optional metadata and scope
   * @throws Error if scope is 'project' but no project directory is configured
   */
  async writeRule(
    rule: Rule,
    options?: { scope?: EntityScope }
  ): Promise<WriteResult> {
    return this.getEntityWriterForScope(options?.scope).writeRule(rule);
  }

  /**
   * Delete a rule file
   * @param name - Rule name (without .md extension)
   * @param options - Optional scope (default: 'project')
   * @throws Error if scope is 'project' but no project directory is configured
   */
  async deleteRule(
    name: string,
    options?: { scope?: EntityScope }
  ): Promise<{ deleted: boolean; path: string }> {
    return this.getEntityWriterForScope(options?.scope).deleteRule(name);
  }

  /**
   * Get a specific rule by name
   * @param name - Rule name (without .md extension)
   * @param options - Optional scope (default: 'project')
   * @throws Error if scope is 'project' but no project directory is configured
   */
  async getRule(
    name: string,
    options?: { scope?: EntityScope }
  ): Promise<Rule | null> {
    return this.getEntityWriterForScope(options?.scope).getRule(name);
  }

  /**
   * List all rules in the rules directory
   * @param options - Optional scope (default: 'project')
   * @throws Error if scope is 'project' but no project directory is configured
   */
  async listRulesFromScope(options?: { scope?: EntityScope }): Promise<Rule[]> {
    return this.getEntityWriterForScope(options?.scope).listRules();
  }

  // ==================== SESSION TRANSCRIPTS ====================

  /**
   * List all projects that have session data
   */
  async listProjects(): Promise<ProjectInfo[]> {
    return this.sessionLoader.listProjects();
  }

  /**
   * List all session IDs for a project
   * @param projectPath - Optional project path (defaults to this.projectDir)
   * @throws Error if no project path provided and no projectDir configured
   */
  async listSessions(projectPath?: string): Promise<string[]> {
    const path = projectPath || this.projectDir;
    if (!path) {
      throw new Error("No project path provided and no projectDir configured");
    }
    return this.sessionLoader.listSessions(path);
  }

  /**
   * List all sessions for a project with metadata.
   *
   * More efficient than calling getSessionMetadata for each session,
   * as it builds the subagent map once and reuses it.
   *
   * @param projectPath - Optional project path (defaults to this.projectDir)
   * @throws Error if no project path provided and no projectDir configured
   */
  async listSessionsWithMetadata(projectPath?: string): Promise<SessionMetadata[]> {
    const path = projectPath || this.projectDir;
    if (!path) {
      throw new Error("No project path provided and no projectDir configured");
    }
    return this.sessionLoader.listSessionsWithMetadata(path);
  }

  /**
   * Get metadata for a specific session
   * @param sessionId - The session UUID
   * @param projectPath - Optional project path (defaults to this.projectDir)
   * @throws Error if no project path provided and no projectDir configured
   */
  async getSessionMetadata(
    sessionId: string,
    projectPath?: string
  ): Promise<SessionMetadata> {
    const path = projectPath || this.projectDir;
    if (!path) {
      throw new Error("No project path provided and no projectDir configured");
    }
    return this.sessionLoader.getSessionMetadata(path, sessionId);
  }

  /**
   * Read session transcript as raw JSONL strings
   * @param sessionId - The session UUID
   * @param options - Read options including projectPath and includeSubagents
   * @throws Error if no project path provided and no projectDir configured
   */
  async readSessionRaw(
    sessionId: string,
    options?: ReadSessionOptions & { projectPath?: string }
  ): Promise<import("@ai-systems/shared-types").CombinedClaudeTranscript> {
    const path = options?.projectPath || this.projectDir;
    if (!path) {
      throw new Error("No project path provided and no projectDir configured");
    }
    return this.sessionLoader.readRaw(path, sessionId, options);
  }

  /**
   * Read session transcript as parsed SDKMessage arrays
   * @param sessionId - The session UUID
   * @param options - Read options including projectPath and includeSubagents
   * @throws Error if no project path provided and no projectDir configured
   */
  async readSessionParsedJsonl(
    sessionId: string,
    options?: ReadSessionOptions & { projectPath?: string }
  ): Promise<ParsedJsonlTranscript> {
    const path = options?.projectPath || this.projectDir;
    if (!path) {
      throw new Error("No project path provided and no projectDir configured");
    }
    return this.sessionLoader.readParsedJsonl(path, sessionId, options);
  }

  /**
   * Read session transcript as ConversationBlocks
   * @param sessionId - The session UUID
   * @param options - Read options including projectPath and includeSubagents
   * @throws Error if no project path provided and no projectDir configured
   */
  async readSessionBlocks(
    sessionId: string,
    options?: ReadSessionOptions & { projectPath?: string }
  ): Promise<import("@ai-systems/shared-types").ParsedTranscript> {
    const path = options?.projectPath || this.projectDir;
    if (!path) {
      throw new Error("No project path provided and no projectDir configured");
    }
    return this.sessionLoader.readBlocks(path, sessionId, options);
  }

  /**
   * Write session transcript to disk
   * @param sessionId - The session UUID
   * @param transcript - The combined transcript data
   * @param projectPath - Optional project path (defaults to this.projectDir)
   * @returns Path to the main transcript file
   * @throws Error if no project path provided and no projectDir configured
   */
  async writeSessionRaw(
    sessionId: string,
    transcript: import("@ai-systems/shared-types").CombinedClaudeTranscript,
    projectPath?: string
  ): Promise<string> {
    const path = projectPath || this.projectDir;
    if (!path) {
      throw new Error("No project path provided and no projectDir configured");
    }
    return this.sessionLoader.writeRaw(path, sessionId, transcript);
  }

  /**
   * Check if a session exists anywhere in the projects directory
   * @param sessionId - The session UUID to look for
   * @returns true if the session exists in any project
   */
  async sessionExists(sessionId: string): Promise<boolean> {
    return this.sessionLoader.sessionExists(sessionId);
  }
}
