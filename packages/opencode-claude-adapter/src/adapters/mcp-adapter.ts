/**
 * MCP Adapter
 *
 * Syncs MCP server configurations from Claude Code format (.claude/.mcp.json)
 * to OpenCode format (opencode.json).
 *
 * Transformations:
 * - Reads from .claude/.mcp.json (Claude SDK format)
 * - Writes to opencode.config.json (OpenCode format)
 * - Merges with existing OpenCode config if present
 */

import type { McpServer, McpServerConfig, OpencodeMcpServerConfig, OpencodeSettings } from "@ai-systems/shared-types";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";

interface SyncResult {
  written: string[];
  skipped: string[];
  errors: Array<{ file: string; error: string }>;
}


/**
 * Read existing opencode.config.json if present
 */
async function readOpencodeConfig(projectDir: string): Promise<OpencodeSettings> {
  const configPath = join(projectDir, "opencode.json");

  try {
    const content = await readFile(configPath, "utf-8");
    return JSON.parse(content) as OpencodeSettings;
  } catch {
    // File doesn't exist or can't be parsed - start fresh
    return {};
  }
}

/**
 * Write opencode.json with MCP servers
 */
async function writeOpencodeConfig(
  projectDir: string,
  config: OpencodeSettings
): Promise<void> {
  const configPath = join(projectDir, "opencode.json");
  await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Transform Claude MCP server config to OpenCode format
 */
function transformMcpServer(server: McpServerConfig): OpencodeMcpServerConfig | undefined {

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
  return undefined
}

/**
 * Sync MCP servers to opencode.json
 */
export async function syncMcpServers(
  mcpServers: McpServer[],
  projectDir: string
): Promise<SyncResult> {
  const result: SyncResult = {
    written: [],
    skipped: [],
    errors: [],
  };

  if (mcpServers.length === 0) {
    return result;
  }

  try {
    // Read existing config
    const config = await readOpencodeConfig(projectDir);

    // Clear existing MCP entries and start fresh
    config.mcp = {};

    // Add MCP servers (later sources override earlier)
    for (const server of mcpServers) {
      const transformed = transformMcpServer(server);
      if (transformed) {
        config.mcp[server.name] = transformed;
      }
      result.written.push(server.name);
    }

    // Write updated config
    await writeOpencodeConfig(projectDir, config);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.errors.push({ file: "opencode.json", error: message });
  }

  return result;
}
