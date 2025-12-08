import type { McpHttpServerConfig, McpStdioServerConfig } from "@anthropic-ai/claude-agent-sdk";

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
export type McpServerConfig = McpHttpServerConfig | McpStdioServerConfig; 

/**
 * MCP server defined in a plugin manifest
 */
export type PluginMcpServer = McpServerConfig & {
  /** Plugin this server belongs to */
  pluginId?: string;
};
