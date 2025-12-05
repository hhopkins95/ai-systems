import { readFile, readdir, stat, access } from "fs/promises";
import { join, basename } from "path";
import type {
  Plugin,
  PluginManifest,
  MarketplaceManifest,
  PluginSource,
  KnownMarketplace,
  PluginEnabledStatus,
} from "../types.js";
import { EntityDiscovery } from "./EntityDiscovery.js";
import { PluginRegistryService } from "../registry/PluginRegistry.js";
import { MarketplaceRegistryService } from "../registry/MarketplaceRegistry.js";
import { SettingsManager } from "../registry/SettingsManager.js";
import {
  getPluginManifestPath,
  getMarketplaceManifestPath,
  getCacheDir,
} from "../utils/paths.js";

/**
 * Service for discovering plugins from marketplaces and cache
 */
export class PluginDiscovery {
  private entityDiscovery: EntityDiscovery;
  private pluginRegistry: PluginRegistryService;
  private marketplaceRegistry: MarketplaceRegistryService;
  private settingsManager: SettingsManager;

  constructor(
    private claudeDir: string,
    projectDir?: string
  ) {
    this.entityDiscovery = new EntityDiscovery();
    this.pluginRegistry = new PluginRegistryService(claudeDir);
    this.marketplaceRegistry = new MarketplaceRegistryService(claudeDir);
    this.settingsManager = new SettingsManager(claudeDir, projectDir);
  }

  /**
   * Compute the enabled status from the settings value
   */
  private computeEnabledStatus(
    pluginId: string,
    enabledStates: Record<string, boolean>
  ): PluginEnabledStatus {
    const value = enabledStates[pluginId];
    if (value === false) return "disabled";
    if (value === true) return "explicit-enabled";
    return "implicit-enabled";
  }

  /**
   * Discover all plugins from marketplaces and cache
   * @param includeDisabled - Whether to include disabled plugins
   */
  async discoverPlugins(includeDisabled = false): Promise<Plugin[]> {
    const plugins: Plugin[] = [];
    const seenIds = new Set<string>();

    // Get enabled states
    const enabledStates = await this.settingsManager.getPluginStates();

    // Get installed plugins from registry
    const installedPlugins = await this.pluginRegistry.getAllInstalledPlugins();

    // Get known marketplaces
    const marketplaces = await this.marketplaceRegistry.getMarketplaces();

    // Discover from marketplaces
    for (const [marketplaceName, marketplace] of Object.entries(marketplaces)) {
      const marketplacePlugins = await this.discoverMarketplacePlugins(
        marketplaceName,
        marketplace,
        installedPlugins,
        enabledStates
      );

      for (const plugin of marketplacePlugins) {
        if (!seenIds.has(plugin.id)) {
          seenIds.add(plugin.id);
          plugins.push(plugin);
        }
      }
    }

    // Discover from cache (standalone plugins not in marketplaces)
    const cachePlugins = await this.discoverCachePlugins(
      installedPlugins,
      enabledStates,
      seenIds
    );
    plugins.push(...cachePlugins);

    // Filter disabled if requested
    if (!includeDisabled) {
      return plugins.filter((p) => p.enabled);
    }

    return plugins;
  }

  /**
   * Discover plugins from a specific marketplace
   */
  private async discoverMarketplacePlugins(
    marketplaceName: string,
    marketplace: KnownMarketplace,
    installedPlugins: Map<string, { installPath: string }>,
    enabledStates: Record<string, boolean>
  ): Promise<Plugin[]> {
    const plugins: Plugin[] = [];
    const marketplaceDir = marketplace.installLocation;

    // Load marketplace manifest
    const manifest = await this.loadMarketplaceManifest(marketplaceDir);

    // If no manifest, check if this is a "skills collection" (skills at root level)
    if (!manifest) {
      const skillsCollectionPlugins = await this.discoverSkillsCollection(
        marketplaceName,
        marketplaceDir,
        enabledStates
      );
      plugins.push(...skillsCollectionPlugins);
      return plugins;
    }

    for (const pluginEntry of manifest.plugins) {
      const pluginId = `${pluginEntry.name}@${marketplaceName}`;

      // Resolve plugin path
      let pluginPath: string;
      if (
        typeof pluginEntry.source === "string" &&
        pluginEntry.source.startsWith("./")
      ) {
        // Local plugin within marketplace
        if (pluginEntry.source === "./") {
          // "./" can mean either:
          // 1. Plugin has its own subdirectory (e.g., document-skills/)
          // 2. Plugin's content is at marketplace root (e.g., example-skills)
          const namedSubdir = join(marketplaceDir, pluginEntry.name);
          try {
            await access(namedSubdir);
            pluginPath = namedSubdir;
          } catch {
            // No subdirectory, use marketplace root
            pluginPath = marketplaceDir;
          }
        } else {
          pluginPath = join(marketplaceDir, pluginEntry.source);
        }
      } else if (
        typeof pluginEntry.source === "object" &&
        pluginEntry.source.source === "url"
      ) {
        // URL-based plugin - check cache
        pluginPath = join(getCacheDir(this.claudeDir), pluginEntry.name);
      } else {
        // Default path within marketplace
        pluginPath = join(marketplaceDir, "plugins", pluginEntry.name);
      }

      // Verify plugin directory exists
      try {
        await access(pluginPath);
      } catch {
        // Plugin not installed locally, skip
        continue;
      }

      // Count entities
      const counts = await this.entityDiscovery.countEntities(pluginPath);

      // Get install info if available
      const installInfo = installedPlugins.get(pluginId);

      const plugin: Plugin = {
        id: pluginId,
        name: pluginEntry.name,
        marketplace: marketplaceName,
        description: pluginEntry.description,
        version: pluginEntry.version,
        source: this.resolveSource(pluginEntry.source, marketplaceDir),
        path: pluginPath,
        enabled: enabledStates[pluginId] !== false,
        installationStatus: "installed", // We verified path exists above
        enabledStatus: this.computeEnabledStatus(pluginId, enabledStates),
        skillCount: counts.skills,
        commandCount: counts.commands,
        agentCount: counts.agents,
        hookCount: counts.hooks,
        hasMcpServers: counts.hasMcp,
        installInfo: installInfo
          ? {
              version: installInfo.installPath, // Temp fix
              installedAt: "",
              lastUpdated: "",
              installPath: installInfo.installPath,
              isLocal: true,
            }
          : undefined,
      };

      plugins.push(plugin);
    }

    return plugins;
  }

  /**
   * Discover standalone plugins from cache
   */
  private async discoverCachePlugins(
    installedPlugins: Map<string, { installPath: string }>,
    enabledStates: Record<string, boolean>,
    seenIds: Set<string>
  ): Promise<Plugin[]> {
    const plugins: Plugin[] = [];
    const cacheDir = getCacheDir(this.claudeDir);

    try {
      const entries = await readdir(cacheDir);

      for (const entry of entries) {
        const pluginPath = join(cacheDir, entry);
        const pluginStat = await stat(pluginPath);
        if (!pluginStat.isDirectory()) continue;

        // Try to load plugin manifest
        const manifest = await this.loadPluginManifest(pluginPath);
        if (!manifest) continue;

        let pluginId = manifest.name;

        // Skip if already seen (from marketplace)
        if (seenIds.has(pluginId)) continue;

        // Check if this cache plugin belongs to a marketplace
        let isMarketplacePlugin = false;
        let marketplaceName: string | undefined;
        for (const [installedId] of installedPlugins) {
          if (installedId.startsWith(`${manifest.name}@`)) {
            marketplaceName = installedId.split("@")[1];
            // If marketplace version was already discovered, skip this cache entry
            if (seenIds.has(installedId)) {
              isMarketplacePlugin = true;
              break;
            }
          }
        }
        if (isMarketplacePlugin) continue;

        // If this is a marketplace plugin in cache, use the full ID
        if (marketplaceName) {
          pluginId = `${manifest.name}@${marketplaceName}`;
        }

        // Count entities
        const counts = await this.entityDiscovery.countEntities(pluginPath);

        const plugin: Plugin = {
          id: pluginId,
          name: manifest.displayName || manifest.name,
          marketplace: marketplaceName,
          description: manifest.description,
          version: manifest.version,
          source: { source: "directory", path: pluginPath },
          path: pluginPath,
          enabled: enabledStates[pluginId] !== false,
          installationStatus: "installed",
          enabledStatus: this.computeEnabledStatus(pluginId, enabledStates),
          skillCount: counts.skills,
          commandCount: counts.commands,
          agentCount: counts.agents,
          hookCount: counts.hooks,
          hasMcpServers: counts.hasMcp,
        };

        plugins.push(plugin);
        seenIds.add(pluginId);
      }
    } catch {
      // Cache directory doesn't exist
    }

    return plugins;
  }

  /**
   * Discover plugins from a "skills collection" marketplace - one that has skills
   * at root level instead of a manifest (e.g., anthropic-agent-skills)
   */
  private async discoverSkillsCollection(
    marketplaceName: string,
    marketplaceDir: string,
    enabledStates: Record<string, boolean>
  ): Promise<Plugin[]> {
    const plugins: Plugin[] = [];

    // Get registered plugins for this marketplace from installed_plugins.json
    const installedPlugins = await this.pluginRegistry.getAllInstalledPlugins();
    const marketplacePluginIds: string[] = [];

    for (const [pluginId] of installedPlugins) {
      if (pluginId.endsWith(`@${marketplaceName}`)) {
        marketplacePluginIds.push(pluginId);
      }
    }

    // If we have registered plugins, create entries for each
    if (marketplacePluginIds.length > 0) {
      for (const pluginId of marketplacePluginIds) {
        const pluginName = pluginId.split("@")[0];
        const pluginPath = join(marketplaceDir, pluginName);

        // Check if the plugin directory exists
        let pluginDirExists = false;
        try {
          await access(pluginPath);
          pluginDirExists = true;
        } catch {
          // Plugin directory doesn't exist, might be skills at root level
        }

        // Count skills for this plugin
        let skillCount = 0;
        const searchPath = pluginDirExists ? pluginPath : marketplaceDir;

        try {
          const entries = await readdir(searchPath);
          for (const entry of entries) {
            if (entry.startsWith(".")) continue;

            const entryPath = join(searchPath, entry);
            const entryStat = await stat(entryPath);
            if (!entryStat.isDirectory()) continue;

            // For plugins with their own directory (like document-skills),
            // only count skills within that directory
            if (pluginDirExists) {
              try {
                await access(join(entryPath, "SKILL.md"));
                skillCount++;
              } catch {
                // Not a skill
              }
            } else {
              // For root-level skills, check if this directory has SKILL.md
              try {
                await access(join(entryPath, "SKILL.md"));
                skillCount++;
              } catch {
                // Not a skill at this level
              }
            }
          }
        } catch {
          // Can't read directory
        }

        const installInfo = installedPlugins.get(pluginId);

        plugins.push({
          id: pluginId,
          name: pluginName,
          marketplace: marketplaceName,
          description: installInfo
            ? `Installed from ${marketplaceName}`
            : undefined,
          source: { source: "directory", path: searchPath },
          path: searchPath,
          enabled: enabledStates[pluginId] !== false,
          installationStatus: "installed",
          enabledStatus: this.computeEnabledStatus(pluginId, enabledStates),
          skillCount,
          commandCount: 0,
          agentCount: 0,
          hookCount: 0,
          hasMcpServers: false,
          installInfo: installInfo
            ? {
                version: installInfo.installPath,
                installedAt: "",
                lastUpdated: "",
                installPath: installInfo.installPath,
                isLocal: true,
              }
            : undefined,
        });
      }
    }

    return plugins;
  }

  /**
   * Get a specific plugin by ID
   */
  async getPlugin(pluginId: string): Promise<Plugin | null> {
    const plugins = await this.discoverPlugins(true);
    return plugins.find((p) => p.id === pluginId) || null;
  }

  /**
   * Load a plugin manifest
   */
  async loadPluginManifest(pluginDir: string): Promise<PluginManifest | null> {
    try {
      const manifestPath = getPluginManifestPath(pluginDir);
      const content = await readFile(manifestPath, "utf-8");
      return JSON.parse(content) as PluginManifest;
    } catch {
      return null;
    }
  }

  /**
   * Load a marketplace manifest
   */
  async loadMarketplaceManifest(
    marketplaceDir: string
  ): Promise<MarketplaceManifest | null> {
    try {
      const manifestPath = getMarketplaceManifestPath(marketplaceDir);
      const content = await readFile(manifestPath, "utf-8");
      return JSON.parse(content) as MarketplaceManifest;
    } catch {
      return null;
    }
  }

  /**
   * Resolve a plugin source to a PluginSource object
   */
  private resolveSource(
    source: string | PluginSource,
    baseDir: string
  ): PluginSource {
    if (typeof source === "string") {
      if (source.startsWith("./")) {
        return { source: "directory", path: join(baseDir, source) };
      }
      return { source: "url", url: source };
    }
    return source;
  }
}
