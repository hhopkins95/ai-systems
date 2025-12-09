import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import type {
  KnownMarketplace,
  KnownMarketplacesRegistry,
} from "../types.js";
import type { PluginSource } from "@ai-systems/shared-types";
import { getKnownMarketplacesPath } from "../utils/paths.js";

/**
 * Service for reading and writing the known marketplaces registry
 * Location: ~/.claude/plugins/known_marketplaces.json
 */
export class MarketplaceRegistryService {
  constructor(private claudeDir: string) {}

  /**
   * Get all known marketplaces
   */
  async getMarketplaces(): Promise<KnownMarketplacesRegistry> {
    try {
      const content = await readFile(
        getKnownMarketplacesPath(this.claudeDir),
        "utf-8"
      );
      return JSON.parse(content) as KnownMarketplacesRegistry;
    } catch {
      // Registry doesn't exist or can't be read
      return {};
    }
  }

  /**
   * Get a specific marketplace by name
   */
  async getMarketplace(name: string): Promise<KnownMarketplace | null> {
    const marketplaces = await this.getMarketplaces();
    return marketplaces[name] || null;
  }

  /**
   * Check if a marketplace is registered
   */
  async isRegistered(name: string): Promise<boolean> {
    const marketplace = await this.getMarketplace(name);
    return marketplace !== null;
  }

  /**
   * Get the installation location for a marketplace
   */
  async getInstallLocation(name: string): Promise<string | null> {
    const marketplace = await this.getMarketplace(name);
    return marketplace?.installLocation || null;
  }

  /**
   * Add or update a marketplace in the registry
   */
  async setMarketplace(
    name: string,
    source: PluginSource,
    installLocation: string
  ): Promise<void> {
    const marketplaces = await this.getMarketplaces();
    marketplaces[name] = {
      source,
      installLocation,
      lastUpdated: new Date().toISOString(),
    };
    await this.saveRegistry(marketplaces);
  }

  /**
   * Update the lastUpdated timestamp for a marketplace
   */
  async touchMarketplace(name: string): Promise<void> {
    const marketplaces = await this.getMarketplaces();
    if (marketplaces[name]) {
      marketplaces[name].lastUpdated = new Date().toISOString();
      await this.saveRegistry(marketplaces);
    }
  }

  /**
   * Remove a marketplace from the registry
   */
  async removeMarketplace(name: string): Promise<void> {
    const marketplaces = await this.getMarketplaces();
    delete marketplaces[name];
    await this.saveRegistry(marketplaces);
  }

  /**
   * Save the registry to disk
   */
  private async saveRegistry(
    marketplaces: KnownMarketplacesRegistry
  ): Promise<void> {
    const registryPath = getKnownMarketplacesPath(this.claudeDir);
    await mkdir(dirname(registryPath), { recursive: true });
    await writeFile(registryPath, JSON.stringify(marketplaces, null, 2), "utf-8");
  }
}
