/**
 * Plugin installation source specification.
 *
 * This is the unified type for specifying how to install a plugin:
 * - marketplace: Install from a known marketplace (e.g., "pdf@example-skills")
 * - local: Install from a local directory path
 * - github: Install from a GitHub repository
 * - url: Install from a git URL
 */
export type ClaudePluginInstallSource = {
  marketplace : ClaudePluginMarketplaceSource, 
  pluginName : string
}


export type ClaudePluginMarketplaceSource = {
  type : "github",
  name : string, 
  gitOwner : string,
  gitRepo : string
} | { 
  type : "local",
  name : string, 
  path : string
} | {
  type : "url",
  name : string, 
  url : string
}