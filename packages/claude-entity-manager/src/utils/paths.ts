import { homedir } from "os";
import { join } from "path";

/**
 * Get the Claude config directory
 * @param customDir - Custom directory path (overrides default)
 * @returns Absolute path to Claude config directory
 *
 * Resolution order:
 * 1. customDir parameter (if provided)
 * 2. CLAUDE_CONFIG_DIR environment variable (if set)
 * 3. Default: ~/.claude
 */
export function getClaudeDir(customDir?: string): string {
  return customDir || process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
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
 * Get the rules directory for a base path
 */
export function getRulesDir(basePath: string): string {
  return join(basePath, "rules");
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

// ==================== SESSION/TRANSCRIPT PATHS ====================

/**
 * Get the projects directory where Claude stores per-project data
 */
export function getProjectsDir(claudeDir: string): string {
  return join(claudeDir, "projects");
}

/**
 * Convert an absolute project path to Claude's folder name format.
 *
 * Claude stores project data in folders named after the project path,
 * with slashes replaced by dashes.
 *
 * @example
 * getProjectDirName("/Users/hunter/my-project") // "-Users-hunter-my-project"
 * getProjectDirName("/Users/hunter/.dotfiles")  // "-Users-hunter--dotfiles"
 */
export function getProjectDirName(projectPath: string): string {
  // Replace forward slashes and periods with dashes
  // This matches Claude's folder naming convention
  // e.g., "/Users/hunter/.dotfiles" → "-Users-hunter--dotfiles"
  return projectPath.replace(/[\/\.]/g, "-");
}

/**
 * Reverse a Claude project folder name back to the original path.
 *
 * @example
 * reverseProjectDirName("-Users-hunter-my-project") // "/Users/hunter/my-project"
 */
export function reverseProjectDirName(folderName: string): string {
  // The folder name starts with a dash (from leading /)
  // We need to be careful: not all dashes are path separators
  // Claude's convention: leading dash + path segments separated by dashes
  // This is imperfect for paths with actual dashes, but matches Claude's behavior
  if (folderName.startsWith("-")) {
    return folderName.replace(/-/g, "/");
  }
  return "/" + folderName.replace(/-/g, "/");
}

/**
 * Get the transcript directory for a specific project.
 *
 * @param claudeDir - The Claude config directory
 * @param projectPath - The absolute path to the project
 * @returns Path to the directory containing session transcripts
 */
export function getProjectTranscriptDir(
  claudeDir: string,
  projectPath: string
): string {
  return join(getProjectsDir(claudeDir), getProjectDirName(projectPath));
}
