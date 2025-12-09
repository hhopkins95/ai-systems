import { readFile } from "fs/promises";
import { join } from "path";
import type { ClaudeMcpJsonConfig, EntitySource, McpServerWithSource } from "@ai-systems/shared-types";
import { getMcpConfigPath } from "../utils/paths.js";

/**
 * Loader for MCP server configurations
 *
 * Loads MCP servers from:
 * - Global config: ~/.claude/.mcp.json
 * - Project config: .claude/.mcp.json
 * - Plugin manifests: .claude-plugin/plugin.json
 */
export class MCPLoader {
  /**
   * Load MCP servers from a .mcp.json file
   * @param baseDir - Base directory containing .mcp.json (e.g., ~/.claude or project/.claude)
   * @param source - Source information for loaded servers
   */
  async loadMcpServers(
    baseDir: string,
    source: Omit<EntitySource, "path">
  ): Promise<McpServerWithSource[]> {
    const mcpPath = getMcpConfigPath(baseDir);

    try {
      const content = await readFile(mcpPath, "utf-8");
      const config = JSON.parse(content) as ClaudeMcpJsonConfig;

      if (!config.mcpServers) {
        return [];
      }

      return this.parseServersRecord(config.mcpServers, {
        ...source,
        path: mcpPath,
      });
    } catch (error) {
      // File doesn't exist or can't be read - that's OK
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn(`Error loading MCP config from ${mcpPath}:`, error);
      }
      return [];
    }
  }

  /**
   * Load MCP servers from a plugin manifest
   * @param pluginDir - Plugin directory containing .claude-plugin/plugin.json
   * @param source - Source information for loaded servers
   */
  async loadMcpServersFromPlugin(
    pluginDir: string,
    source: Omit<EntitySource, "path"> & { pluginId?: string }
  ): Promise<McpServerWithSource[]> {
    const manifestPath = join(pluginDir, ".claude-plugin", "plugin.json");

    try {
      const content = await readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(content) as {
        mcpServers?: Record<string, unknown>;
      };

      if (!manifest.mcpServers) {
        return [];
      }

      return this.parseServersRecord(manifest.mcpServers, {
        ...source,
        path: manifestPath,
      });
    } catch (error) {
      // File doesn't exist or can't be read - that's OK
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn(
          `Error loading MCP servers from plugin ${pluginDir}:`,
          error
        );
      }
      return [];
    }
  }

  /**
   * Load MCP servers from an inline .mcp.json at plugin root
   * Some plugins use a .mcp.json file at the root instead of embedding in plugin.json
   */
  async loadMcpServersFromPluginMcpJson(
    pluginDir: string,
    source: Omit<EntitySource, "path"> & { pluginId?: string }
  ): Promise<McpServerWithSource[]> {
    const mcpJsonPath = join(pluginDir, ".mcp.json");

    try {
      const content = await readFile(mcpJsonPath, "utf-8");
      const config = JSON.parse(content) as ClaudeMcpJsonConfig | Record<string, unknown>;

      // Support both { mcpServers: {...} } and direct { serverName: config } format
      const serversRecord = "mcpServers" in config && config.mcpServers
        ? config.mcpServers
        : (config as Record<string, unknown>);

      return this.parseServersRecord(serversRecord as Record<string, unknown>, {
        ...source,
        path: mcpJsonPath,
      });
    } catch (error) {
      // File doesn't exist or can't be read - that's OK
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn(
          `Error loading .mcp.json from plugin ${pluginDir}:`,
          error
        );
      }
      return [];
    }
  }

  /**
   * Parse a record of MCP server configs into an array with source tracking
   */
  private parseServersRecord(
    servers: Record<string, unknown>,
    source: EntitySource
  ): McpServerWithSource[] {
    const result: McpServerWithSource[] = [];

    for (const [name, config] of Object.entries(servers)) {
      if (!config || typeof config !== "object") {
        continue;
      }

      const serverConfig = config as Record<string, unknown>;

      // Build McpServerWithSource from the config object
      const mcpServer: McpServerWithSource = {
        name,
        source,
      };

      // Type field (defaults to 'stdio' if not specified)
      if (serverConfig.type === "http") {
        mcpServer.type = "http";
      } else if (serverConfig.type === "stdio") {
        mcpServer.type = "stdio";
      }
      // If no type specified, infer from fields: url means http, command means stdio

      // Stdio server fields
      if (typeof serverConfig.command === "string") {
        mcpServer.command = serverConfig.command;
      }
      if (Array.isArray(serverConfig.args)) {
        mcpServer.args = serverConfig.args as string[];
      }
      if (serverConfig.env && typeof serverConfig.env === "object") {
        mcpServer.env = serverConfig.env as Record<string, string>;
      }

      // HTTP server fields
      if (typeof serverConfig.url === "string") {
        mcpServer.url = serverConfig.url;
      }
      if (serverConfig.headers && typeof serverConfig.headers === "object") {
        mcpServer.headers = serverConfig.headers as Record<string, string>;
      }

      result.push(mcpServer);
    }

    return result;
  }
}
