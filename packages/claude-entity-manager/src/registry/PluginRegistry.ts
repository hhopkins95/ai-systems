import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import type { PluginRegistry, InstalledPluginInfo } from "../types.js";
import { getInstalledPluginsPath, getPluginsDir } from "../utils/paths.js";

/**
 * Service for reading and writing the installed plugins registry
 * Location: ~/.claude/plugins/installed_plugins.json
 */
export class PluginRegistryService {
  constructor(private claudeDir: string) {}

  /**
   * Get the full plugin registry
   */
  async getRegistry(): Promise<PluginRegistry> {
    try {
      const content = await readFile(
        getInstalledPluginsPath(this.claudeDir),
        "utf-8"
      );
      return JSON.parse(content) as PluginRegistry;
    } catch {
      // Registry doesn't exist or can't be read
      return { version: 1, plugins: {} };
    }
  }

  /**
   * Get all installed plugins as a Map
   */
  async getAllInstalledPlugins(): Promise<Map<string, InstalledPluginInfo>> {
    const registry = await this.getRegistry();
    const pluginsMap = new Map<string, InstalledPluginInfo>();

    for (const [pluginId, info] of Object.entries(registry.plugins)) {
      pluginsMap.set(pluginId, info);
    }

    return pluginsMap;
  }

  /**
   * Get installation info for a specific plugin
   */
  async getPluginInfo(pluginId: string): Promise<InstalledPluginInfo | null> {
    const registry = await this.getRegistry();
    return registry.plugins[pluginId] || null;
  }

  /**
   * Get the installation path for a specific plugin
   */
  async getPluginPath(pluginId: string): Promise<string | null> {
    const info = await this.getPluginInfo(pluginId);
    return info?.installPath || null;
  }

  /**
   * Check if a plugin is installed
   */
  async isInstalled(pluginId: string): Promise<boolean> {
    const info = await this.getPluginInfo(pluginId);
    return info !== null;
  }

  /**
   * Add or update a plugin in the registry
   */
  async setPlugin(pluginId: string, info: InstalledPluginInfo): Promise<void> {
    const registry = await this.getRegistry();
    registry.plugins[pluginId] = info;
    await this.saveRegistry(registry);
  }

  /**
   * Remove a plugin from the registry
   */
  async removePlugin(pluginId: string): Promise<void> {
    const registry = await this.getRegistry();
    delete registry.plugins[pluginId];
    await this.saveRegistry(registry);
  }

  /**
   * Save the registry to disk
   */
  private async saveRegistry(registry: PluginRegistry): Promise<void> {
    const registryPath = getInstalledPluginsPath(this.claudeDir);
    await mkdir(dirname(registryPath), { recursive: true });
    await writeFile(registryPath, JSON.stringify(registry, null, 2), "utf-8");
  }
}
