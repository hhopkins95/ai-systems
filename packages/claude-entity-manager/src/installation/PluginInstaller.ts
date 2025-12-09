import { simpleGit, type SimpleGit } from "simple-git";
import { mkdir, rm, access, cp, readFile } from "fs/promises";
import { join, basename } from "path";
import type {
  PluginInstallSource,
  PluginInstallResult,
  PluginInstallOptions,
  MarketplaceManifest,
} from "../types.js";
import { SourceParser } from "./SourceParser.js";
import { PluginRegistryService } from "../registry/PluginRegistry.js";
import { MarketplaceRegistryService } from "../registry/MarketplaceRegistry.js";
import {
  getCacheDir,
  getMarketplacesDir,
  getMarketplaceManifestPath,
} from "../utils/paths.js";
import { PluginSource } from "@ai-systems/shared-types";

/**
 * Service for installing plugins from various sources
 */
export class PluginInstaller {
  private git: SimpleGit;
  private sourceParser: SourceParser;
  private pluginRegistry: PluginRegistryService;
  private marketplaceRegistry: MarketplaceRegistryService;

  constructor(private claudeDir: string) {
    this.git = simpleGit();
    this.sourceParser = new SourceParser();
    this.pluginRegistry = new PluginRegistryService(claudeDir);
    this.marketplaceRegistry = new MarketplaceRegistryService(claudeDir);
  }

  /**
   * Install a plugin from various sources
   */
  async install(
    source: string | PluginInstallSource,
    options: PluginInstallOptions = {}
  ): Promise<PluginInstallResult> {
    const parsedSource =
      typeof source === "string" ? this.sourceParser.parse(source) : source;

    switch (parsedSource.type) {
      case "github":
        return this.installFromGitHub(
          parsedSource.owner,
          parsedSource.repo,
          options
        );
      case "url":
        return this.installFromGitUrl(parsedSource.url, options);
      case "directory":
        return this.installFromDirectory(parsedSource.path, options);
      case "marketplace":
        return this.installFromMarketplace(
          parsedSource.pluginName,
          parsedSource.marketplaceName,
          options
        );
    }
  }

  /**
   * Install from GitHub repository
   */
  private async installFromGitHub(
    owner: string,
    repo: string,
    options: PluginInstallOptions
  ): Promise<PluginInstallResult> {
    const url = `https://github.com/${owner}/${repo}.git`;
    return this.installFromGitUrl(url, options, `${owner}/${repo}`);
  }

  /**
   * Install from a git URL
   */
  private async installFromGitUrl(
    url: string,
    options: PluginInstallOptions,
    identifier?: string
  ): Promise<PluginInstallResult> {
    const repoName = basename(url, ".git");
    const pluginId = identifier || repoName;
    const installPath = join(getCacheDir(this.claudeDir), repoName);

    try {
      // Check if already installed
      try {
        await access(installPath);
        if (options.force) {
          await rm(installPath, { recursive: true, force: true });
        } else if (options.update) {
          return this.updateFromGit(installPath, pluginId);
        } else {
          return {
            success: false,
            pluginId,
            installPath,
            error: "Plugin already installed. Use force or update option.",
          };
        }
      } catch {
        // Not installed, continue
      }

      // Ensure cache directory exists
      await mkdir(getCacheDir(this.claudeDir), { recursive: true });

      // Clone repository
      await this.git.clone(url, installPath, ["--depth", "1"]);

      // Get commit SHA
      const localGit = simpleGit(installPath);
      const log = await localGit.log({ maxCount: 1 });
      const commitSha = log.latest?.hash;

      // Update registry
      await this.pluginRegistry.setPlugin(pluginId, {
        version: commitSha?.substring(0, 12) || "unknown",
        installedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        installPath,
        gitCommitSha: commitSha,
        isLocal: false,
      });

      return { success: true, pluginId, installPath };
    } catch (error) {
      return {
        success: false,
        pluginId,
        installPath,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Install from a local directory (registers without copying)
   */
  private async installFromDirectory(
    sourcePath: string,
    options: PluginInstallOptions
  ): Promise<PluginInstallResult> {
    const pluginName = basename(sourcePath);
    const pluginId = pluginName;
    const installPath = sourcePath;

    try {
      // Verify directory exists
      await access(sourcePath);

      // Update registry with local path
      await this.pluginRegistry.setPlugin(pluginId, {
        version: "local",
        installedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        installPath: sourcePath,
        isLocal: true,
      });

      return { success: true, pluginId, installPath };
    } catch (error) {
      return {
        success: false,
        pluginId,
        installPath,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Install a plugin from a known marketplace
   */
  private async installFromMarketplace(
    pluginName: string,
    marketplaceName: string,
    options: PluginInstallOptions
  ): Promise<PluginInstallResult> {
    const pluginId = `${pluginName}@${marketplaceName}`;

    // Get marketplace info
    const marketplace = await this.marketplaceRegistry.getMarketplace(
      marketplaceName
    );
    if (!marketplace) {
      return {
        success: false,
        pluginId,
        installPath: "",
        error: `Marketplace "${marketplaceName}" not found`,
      };
    }

    // Load marketplace manifest
    const manifestPath = getMarketplaceManifestPath(marketplace.installLocation);
    let manifest: MarketplaceManifest;
    try {
      const content = await readFile(manifestPath, "utf-8");
      manifest = JSON.parse(content);
    } catch {
      return {
        success: false,
        pluginId,
        installPath: "",
        error: `Failed to load marketplace manifest`,
      };
    }

    // Find plugin in manifest
    const pluginEntry = manifest.plugins.find((p) => p.name === pluginName);
    if (!pluginEntry) {
      return {
        success: false,
        pluginId,
        installPath: "",
        error: `Plugin "${pluginName}" not found in marketplace "${marketplaceName}"`,
      };
    }

    // Handle different source types
    if (
      typeof pluginEntry.source === "string" &&
      pluginEntry.source.startsWith("./")
    ) {
      // Local marketplace plugin - already installed
      const installPath = join(marketplace.installLocation, pluginEntry.source);

      await this.pluginRegistry.setPlugin(pluginId, {
        version: pluginEntry.version || "unknown",
        installedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        installPath,
        isLocal: true,
      });

      return { success: true, pluginId, installPath };
    } else if (
      typeof pluginEntry.source === "object" &&
      pluginEntry.source.type === "url"
    ) {
      // URL-based plugin - clone to cache
      return this.installFromGitUrl(pluginEntry.source.url, options, pluginId);
    } else if (
      typeof pluginEntry.source === "object" &&
      pluginEntry.source.type === "github"
    ) {
      const repo = pluginEntry.source.repo;
      const [owner, repoName] = repo.split("/");
      return this.installFromGitHub(owner, repoName, {
        ...options,
        // Use marketplace plugin ID
      });
    }

    return {
      success: false,
      pluginId,
      installPath: "",
      error: "Unknown plugin source type",
    };
  }

  /**
   * Update a git-based plugin
   */
  private async updateFromGit(
    installPath: string,
    pluginId: string
  ): Promise<PluginInstallResult> {
    try {
      const localGit = simpleGit(installPath);
      await localGit.pull();

      const log = await localGit.log({ maxCount: 1 });
      const commitSha = log.latest?.hash;

      // Update registry
      const info = await this.pluginRegistry.getPluginInfo(pluginId);
      if (info) {
        await this.pluginRegistry.setPlugin(pluginId, {
          ...info,
          lastUpdated: new Date().toISOString(),
          gitCommitSha: commitSha,
          version: commitSha?.substring(0, 12) || info.version,
        });
      }

      return { success: true, pluginId, installPath };
    } catch (error) {
      return {
        success: false,
        pluginId,
        installPath,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Install a marketplace
   */
  async installMarketplace(
    source: string | PluginSource,
    name: string
  ): Promise<PluginInstallResult> {
    let parsedSource: PluginSource;

    if (typeof source === "string") {
      const parsed = this.sourceParser.parse(source);
      // Convert InstallSource to PluginSource
      if (parsed.type === "github") {
        parsedSource = { type: "github", repo: parsed.repo, owner: parsed.owner };
      } else if (parsed.type === "url") {
        parsedSource = { type: "url", url: parsed.url };
      } else if (parsed.type === "directory") {
        parsedSource = { type: "directory", path: parsed.path };
      } else {
        return {
          success: false,
          pluginId: name,
          installPath: "",
          error: "Cannot install marketplace from marketplace source",
        };
      }
    } else {
      parsedSource = source;
    }

    const installPath = join(getMarketplacesDir(this.claudeDir), name);

    try {
      // Ensure marketplaces directory exists
      await mkdir(getMarketplacesDir(this.claudeDir), { recursive: true });

      if (parsedSource.type === "directory") {
        // Local directory - register without copying
        await this.marketplaceRegistry.setMarketplace(
          name,
          parsedSource,
          parsedSource.path
        );

        return {
          success: true,
          pluginId: name,
          installPath: parsedSource.path,
        };
      }

      // Git-based marketplace
      const url =
        parsedSource.type === "github"
          ? `https://github.com/${parsedSource.repo}.git`
          : parsedSource.url;

      // Check if already installed
      try {
        await access(installPath);
        // Already exists, update
        const localGit = simpleGit(installPath);
        await localGit.pull();
      } catch {
        // Clone
        await this.git.clone(url, installPath, ["--depth", "1"]);
      }

      // Register marketplace
      await this.marketplaceRegistry.setMarketplace(
        name,
        parsedSource,
        installPath
      );

      return { success: true, pluginId: name, installPath };
    } catch (error) {
      return {
        success: false,
        pluginId: name,
        installPath,
        error: error instanceof Error ? error.message : String(error),
      };
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
  async update(pluginId: string): Promise<PluginInstallResult> {
    const info = await this.pluginRegistry.getPluginInfo(pluginId);
    if (!info) {
      return {
        success: false,
        pluginId,
        installPath: "",
        error: `Plugin "${pluginId}" not found`,
      };
    }

    if (info.isLocal) {
      return {
        success: false,
        pluginId,
        installPath: info.installPath,
        error: "Cannot update local plugins",
      };
    }

    return this.updateFromGit(info.installPath, pluginId);
  }
}
