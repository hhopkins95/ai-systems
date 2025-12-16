import { ClaudePluginInstallSource, ClaudePluginMarketplaceSource } from "@ai-systems/shared-types";
import { exec } from "child_process";
import { rm } from "fs/promises";
import { PluginRegistryService } from "../registry/PluginRegistry.js";
import type {
  PluginInstallResult
} from "../types.js";

/**
 * Service for installing plugins from various sources
 */
export class PluginInstaller {
  private pluginRegistry: PluginRegistryService;

  constructor(private claudeDir: string) {
    this.pluginRegistry = new PluginRegistryService(claudeDir);
  }

  /**
   * Install a plugin from various sources
   */
  async install(
    source: ClaudePluginInstallSource,
  ): Promise<void> {

    // verify that the marketplace is installed 
    await this.installMarketplace(source.marketplace);

    // install the plugin
    await exec(`claude plugin install ${source.pluginName}@${source.marketplace.name}`);
    
  }
  


  async installMarketplace(source: ClaudePluginMarketplaceSource): Promise<void> {
    let sourceString = "";
    if (source.type == "github") { 
      sourceString = `${source.gitOwner}/${source.gitRepo}`;
    } else if (source.type == "local") {
      sourceString = source.path;
    } else if (source.type == "url") {
      sourceString = source.url;
    }

    // exec 'claude plugin marketplace install <source>'
    const result = await exec(`claude plugin marketplace install ${sourceString}`);

    if (result.stderr) {
      throw new Error(`Failed to install marketplace: ${result.stderr}`);
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
  async update(plugin : ClaudePluginInstallSource | string): Promise<void> {

  }
}
