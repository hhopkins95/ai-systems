import { homedir } from "os";
import { join } from "path";

/**
 * Get the Claude config directory
 * @param customDir - Custom directory path (overrides default)
 * @returns Absolute path to Claude config directory
 */
export function getClaudeDir(customDir?: string): string {
  return customDir || join(homedir(), ".claude");
}

/**
 * Get the plugins directory
 */
export function getPluginsDir(claudeDir: string): string {
  return join(claudeDir, "plugins");
}

/**
 * Get the marketplaces directory
 */
export function getMarketplacesDir(claudeDir: string): string {
  return join(claudeDir, "plugins", "marketplaces");
}

/**
 * Get the cache directory (for git-cloned plugins)
 */
export function getCacheDir(claudeDir: string): string {
  return join(claudeDir, "plugins", "cache");
}

/**
 * Get the installed plugins registry path
 */
export function getInstalledPluginsPath(claudeDir: string): string {
  return join(claudeDir, "plugins", "installed_plugins.json");
}

/**
 * Get the known marketplaces registry path
 */
export function getKnownMarketplacesPath(claudeDir: string): string {
  return join(claudeDir, "plugins", "known_marketplaces.json");
}

/**
 * Get the global settings path
 */
export function getSettingsPath(claudeDir: string): string {
  return join(claudeDir, "settings.json");
}

/**
 * Get the project-level Claude directory
 */
export function getProjectClaudeDir(projectDir: string): string {
  return join(projectDir, ".claude");
}

/**
 * Get the project-level settings path
 */
export function getProjectSettingsPath(projectDir: string): string {
  return join(projectDir, ".claude", "settings.local.json");
}

/**
 * Get the skills directory for a base path
 */
export function getSkillsDir(basePath: string): string {
  return join(basePath, "skills");
}

/**
 * Get the commands directory for a base path
 */
export function getCommandsDir(basePath: string): string {
  return join(basePath, "commands");
}

/**
 * Get the agents directory for a base path
 */
export function getAgentsDir(basePath: string): string {
  return join(basePath, "agents");
}

/**
 * Get the hooks directory for a base path
 */
export function getHooksDir(basePath: string): string {
  return join(basePath, "hooks");
}

/**
 * Get the plugin manifest path
 */
export function getPluginManifestPath(pluginDir: string): string {
  return join(pluginDir, ".claude-plugin", "plugin.json");
}

/**
 * Get the marketplace manifest path
 */
export function getMarketplaceManifestPath(marketplaceDir: string): string {
  return join(marketplaceDir, ".claude-plugin", "marketplace.json");
}

/**
 * Get the MCP config path for a base directory
 * Returns path to .claude/.mcp.json (project-level) or .mcp.json (in .claude dir for global)
 */
export function getMcpConfigPath(baseDir: string): string {
  // For project directories, it's at .claude/.mcp.json
  // For global (~/.claude), it's at ~/.claude/.mcp.json
  return join(baseDir, ".mcp.json");
}
