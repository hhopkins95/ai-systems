/**
 * Plugin installation source specification.
 *
 * This is the unified type for specifying how to install a plugin:
 * - marketplace: Install from a known marketplace (e.g., "pdf@example-skills")
 * - local: Install from a local directory path
 * - github: Install from a GitHub repository
 * - url: Install from a git URL
 */
export type ClaudePluginInstallSource =
  | { type: "marketplace"; pluginName: string; marketplaceName: string }
  | { type: "local"; path: string }
  | { type: "github"; owner: string; repo: string }
  | { type: "url"; url: string };