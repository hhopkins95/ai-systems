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
      const mcpServer = this.buildServerConfig(name, serverConfig, source);

      if (mcpServer) {
        result.push(mcpServer);
      }
    }

    return result;
  }

  /**
   * Build a properly typed McpServerWithSource from raw config
   */
  private buildServerConfig(
    name: string,
    config: Record<string, unknown>,
    source: EntitySource
  ): McpServerWithSource | null {
    const type = config.type as string | undefined;
    const url = config.url as string | undefined;
    const command = config.command as string | undefined;

    // HTTP server: has type 'http' or has url without command
    if (type === "http" || (url && !command)) {
      if (!url) {
        console.warn(`MCP server "${name}" is http type but missing url`);
        return null;
      }
      return {
        name,
        source,
        type: "http",
        url,
        ...(config.headers && typeof config.headers === "object"
          ? { headers: config.headers as Record<string, string> }
          : {}),
      };
    }

    // Stdio server: has command (type 'stdio' is optional)
    if (command) {
      return {
        name,
        source,
        command,
        ...(type === "stdio" ? { type: "stdio" as const } : {}),
        ...(Array.isArray(config.args) ? { args: config.args as string[] } : {}),
        ...(config.env && typeof config.env === "object"
          ? { env: config.env as Record<string, string> }
          : {}),
      };
    }

    console.warn(`MCP server "${name}" has no command or url, skipping`);
    return null;
  }
}
