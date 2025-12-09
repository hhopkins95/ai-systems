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

import type { McpServerConfig } from "@ai-systems/shared-types";
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
    OpencodeMcpServer>,
  [key: string]: unknown;
}

type OpencodeMcpServer = {
  type: "local",
  command: string[];
  enabled?: boolean
  environment?: Record<string, string>;
} | {
  type: "remote",
  url: string;
  headers?: Record<string, string>;
  enabled?: boolean;
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
function transformMcpServer(server: McpServerConfig): OpencodeMcpServer | undefined {

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
      const transformed = transformMcpServer(server);
      if (transformed) {
        config.mcp[server.] = transformed;
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
