/**
 * MCP (Model Context Protocol) server configuration types
 */

/**
 * Environment variables for MCP server
 */
export type McpEnvVars = Record<string, string>;

/**
 * Configuration for an MCP server
 */
export interface McpServerConfig {
  /** Unique identifier for this server */
  name: string;
  /** Command to start the server */
  command: string;
  /** Arguments to pass to the command */
  args?: string[];
  /** Environment variables */
  env?: McpEnvVars;
  /** Working directory for the server */
  cwd?: string;
}

/**
 * MCP server defined in a plugin manifest
 */
export interface PluginMcpServer extends McpServerConfig {
  /** Plugin this server belongs to */
  pluginId?: string;
}
