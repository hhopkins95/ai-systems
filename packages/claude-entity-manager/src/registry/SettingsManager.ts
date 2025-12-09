import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import type { ClaudeSettingsFile } from "../types.js";
import { getSettingsPath, getProjectSettingsPath } from "../utils/paths.js";

/**
 * Service for reading and writing settings (including plugin enable/disable)
 * Locations:
 *   - Global: ~/.claude/settings.json
 *   - Project: ./.claude/settings.json
 */
export class SettingsManager {
  constructor(
    private claudeDir: string,
    private projectDir?: string
  ) {}

  /**
   * Get global settings
   */
  async getGlobalSettings(): Promise<ClaudeSettingsFile> {
    return this.readSettings(getSettingsPath(this.claudeDir));
  }

  /**
   * Get project settings
   */
  async getProjectSettings(): Promise<ClaudeSettingsFile> {
    if (!this.projectDir) {
      return {};
    }
    return this.readSettings(getProjectSettingsPath(this.projectDir));
  }

  /**
   * Get merged settings (global + project, project overrides global)
   */
  async getSettings(): Promise<ClaudeSettingsFile> {
    const globalSettings = await this.getGlobalSettings();
    const projectSettings = await this.getProjectSettings();

    // Merge enabledPlugins (project overrides global)
    const enabledPlugins = {
      ...globalSettings.enabledPlugins,
      ...projectSettings.enabledPlugins,
    };

    return {
      ...globalSettings,
      ...projectSettings,
      enabledPlugins,
    };
  }

  /**
   * Get all plugin enabled states (merged)
   */
  async getPluginStates(): Promise<Record<string, boolean>> {
    const settings = await this.getSettings();
    return settings.enabledPlugins || {};
  }

  /**
   * Check if a plugin is enabled
   * Returns true if not explicitly disabled (default is enabled)
   */
  async isPluginEnabled(pluginId: string): Promise<boolean> {
    const states = await this.getPluginStates();
    return states[pluginId] !== false;
  }

  /**
   * Enable a plugin (writes to project settings if projectDir is set, otherwise global)
   */
  async enablePlugin(pluginId: string): Promise<void> {
    await this.setPluginState(pluginId, true);
  }

  /**
   * Disable a plugin (writes to project settings if projectDir is set, otherwise global)
   */
  async disablePlugin(pluginId: string): Promise<void> {
    await this.setPluginState(pluginId, false);
  }

  /**
   * Toggle a plugin's enabled state
   * @returns The new enabled state
   */
  async togglePlugin(pluginId: string): Promise<boolean> {
    const currentState = await this.isPluginEnabled(pluginId);
    const newState = !currentState;
    await this.setPluginState(pluginId, newState);
    return newState;
  }

  /**
   * Set a plugin's enabled state
   */
  private async setPluginState(
    pluginId: string,
    enabled: boolean
  ): Promise<void> {
    // Prefer project settings if projectDir is set
    const settingsPath = this.projectDir
      ? getProjectSettingsPath(this.projectDir)
      : getSettingsPath(this.claudeDir);

    const settings = this.projectDir
      ? await this.getProjectSettings()
      : await this.getGlobalSettings();

    settings.enabledPlugins = settings.enabledPlugins || {};
    settings.enabledPlugins[pluginId] = enabled;

    await this.writeSettings(settingsPath, settings);
  }

  /**
   * Read settings from a file
   */
  private async readSettings(path: string): Promise<ClaudeSettingsFile> {
    try {
      const content = await readFile(path, "utf-8");
      return JSON.parse(content) as ClaudeSettingsFile;
    } catch {
      return {};
    }
  }

  /**
   * Write settings to a file
   */
  private async writeSettings(path: string, settings: ClaudeSettingsFile): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(settings, null, 2), "utf-8");
  }
}
