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

import type { McpServerConfig } from "@hhopkins/claude-entity-manager";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";

export interface SyncResult {
  written: string[];
  skipped: string[];
  errors: Array<{ file: string; error: string }>;
}

/**
 * OpenCode config format
 */
interface OpencodeConfig {
  mcp?: Record<
    string,
    {
      command: string;
      args?: string[];
      env?: Record<string, string>;
    }
  >;
  [key: string]: unknown;
}

/**
 * Read existing opencode.config.json if present
 */
async function readOpencodeConfig(projectDir: string): Promise<OpencodeConfig> {
  const configPath = join(projectDir, "opencode.json");

  try {
    const content = await readFile(configPath, "utf-8");
    return JSON.parse(content) as OpencodeConfig;
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
  config: OpencodeConfig
): Promise<void> {
  const configPath = join(projectDir, "opencode.json");
  await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Transform Claude MCP server config to OpenCode format
 */
function transformMcpServer(server: McpServerConfig): {
  command: string;
  args?: string[];
  env?: Record<string, string>;
} {
  return {
    command: server.command,
    args: server.args,
    env: server.env,
  };
}

/**
 * Sync MCP servers to opencode.json
 */
export async function syncMcpServers(
  mcpServers: McpServerConfig[],
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

    // Initialize mcp section if not present
    if (!config.mcp) {
      config.mcp = {};
    }

    // Deduplicate and add MCP servers (later sources override earlier)
    for (const server of mcpServers) {
      config.mcp[server.name] = transformMcpServer(server);
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
