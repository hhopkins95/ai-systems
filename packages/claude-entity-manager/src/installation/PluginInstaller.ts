import { ClaudePluginInstallSource, ClaudePluginMarketplaceSource } from "@ai-systems/shared-types";
import { exec } from "child_process";
import { rm } from "fs/promises";
import { promisify } from "util";
import { MarketplaceRegistryService } from "../registry/MarketplaceRegistry.js";
import { PluginRegistryService } from "../registry/PluginRegistry.js";

const execAsync = promisify(exec);

/**
 * Service for installing plugins from various sources
 */
export class PluginInstaller {
  private pluginRegistry: PluginRegistryService;
  private marketplaceRegistry: MarketplaceRegistryService;

  constructor(private claudeDir: string) {
    this.pluginRegistry = new PluginRegistryService(claudeDir);
    this.marketplaceRegistry = new MarketplaceRegistryService(claudeDir);
  }

  /**
   * Install a plugin from various sources
   */
  async install(source: ClaudePluginInstallSource): Promise<void> {
    // Ensure marketplace is installed first
    await this.installMarketplace(source.marketplace);

    // Install the plugin
    const { stderr } = await execAsync(
      `claude plugin install ${source.pluginName}@${source.marketplace.name}`
    );
    if (stderr) {
      throw new Error(`Failed to install plugin: ${stderr}`);
    }
  }

  async installMarketplace(source: ClaudePluginMarketplaceSource): Promise<void> {
    // Check if already installed
    const isInstalled = await this.marketplaceRegistry.isRegistered(source.name);
    if (isInstalled) {
      return;
    }

    // Build source string for CLI
    let sourceString = "";
    if (source.type === "github") {
      sourceString = `${source.gitOwner}/${source.gitRepo}`;
    } else if (source.type === "local") {
      sourceString = source.path;
    } else if (source.type === "url") {
      sourceString = source.url;
    }

    const { stderr } = await execAsync(
      `claude plugin marketplace add ${sourceString}`
    );
    if (stderr) {
      throw new Error(`Failed to install marketplace: ${stderr}`);
    }
  }

  /**
   * Uninstall a plugin
   */
  async uninstall(pluginId: string): Promise<void> {
    const info = await this.pluginRegistry.getPluginInfo(pluginId);
    if (!info) {
      throw new Error(`Plugin "${pluginId}" not found`);
    }

    // Remove from cache if not local
    if (!info.isLocal) {
      try {
        await rm(info.installPath, { recursive: true, force: true });
      } catch {
        // Directory might not exist
      }
    }

    // Remove from registry
    await this.pluginRegistry.removePlugin(pluginId);
  }

  /**
   * Update a plugin
   */
  async update(plugin: ClaudePluginInstallSource | string): Promise<void> {
    if (typeof plugin === "string") {
      // Plugin ID string like "pluginName@marketplace"
      const { stderr } = await execAsync(`claude plugin update ${plugin}`);
      if (stderr) {
        throw new Error(`Failed to update plugin: ${stderr}`);
      }
    } else {
      // Re-install to update
      await this.install(plugin);
    }
  }
}
