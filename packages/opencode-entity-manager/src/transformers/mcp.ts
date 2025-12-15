/**
 * MCP Transformer
 *
 * Transforms Claude MCP server configurations to OpenCode format.
 *
 * Transformations:
 * - type: "stdio" → type: "local", command + args merged to command array
 * - type: "http" → type: "remote", url and headers preserved
 * - env → environment (rename)
 */

import type {
  McpServerConfig,
  OpencodeMcpServerConfig,
} from "@ai-systems/shared-types";

/**
 * Transform Claude MCP server config to OpenCode format
 *
 * @param server - Claude MCP server configuration
 * @returns OpenCode MCP server configuration, or undefined if type is unknown
 */
export function transformMcpServer(
  server: McpServerConfig
): OpencodeMcpServerConfig | undefined {
  if (server.type === "stdio") {
    return {
      type: "local",
      command: [server.command, ...(server.args || [])],
      environment: server.env,
    };
  }

  if (server.type === "http") {
    return {
      type: "remote",
      url: server.url,
      headers: server.headers,
    };
  }

  return undefined;
}
