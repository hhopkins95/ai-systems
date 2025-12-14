/**
 * Load agent profile core logic.
 *
 * Sets up the environment with agent profile entities, plugins, and MCP servers.
 */

import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import type {
  AgentArchitecture,
  AgentProfile,
  ClaudeMcpJsonConfig,
  OpencodeSettings,
} from '@ai-systems/shared-types';
import { ClaudeEntityManager } from '@hhopkins/claude-entity-manager';

/**
 * Input for loading an agent profile.
 */
export interface LoadAgentProfileInput {
  projectDirPath: string;
  sessionId: string;
  agentProfile: AgentProfile;
  architectureType: AgentArchitecture;
  /** Optional custom claude home directory (defaults to ~/.claude) */
  claudeHomeDir?: string;
}

/**
 * Result of loading an agent profile.
 */
export interface LoadAgentProfileResult {
  success: boolean;
  filesWritten: string[];
  errors?: string[];
}

/**
 * Load an agent profile into the environment.
 *
 * This sets up:
 * - Claude entity manager with plugins, skills, commands, and agents
 * - MCP server configurations (both external and bundled)
 * - OpenCode adapter plugin (if using opencode architecture)
 *
 * @param input - Profile loading parameters
 * @returns Result with success status and files written
 */
export async function loadAgentProfile(
  input: LoadAgentProfileInput
): Promise<LoadAgentProfileResult> {
  const filesWritten: string[] = [];
  const errors: string[] = [];

  try {
    // Always set up the profile for Claude. If opencode, we add the adapter plugin.
    const claudeEntityManager = new ClaudeEntityManager({
      projectDir: input.projectDirPath,
      claudeDir: input.claudeHomeDir,
    });

    // Install all plugins for the agent profile
    const plugins = input.agentProfile.plugins ?? [];
    for (const plugin of plugins) {
      await claudeEntityManager.installPlugin(plugin);
    }

    // Add all custom entities
    for (const skill of input.agentProfile.customEntities.skills ?? []) {
      await claudeEntityManager.writeProjectSkill(skill);
    }
    for (const command of input.agentProfile.customEntities.commands ?? []) {
      await claudeEntityManager.writeProjectCommand(command);
    }
    for (const agent of input.agentProfile.customEntities.subagents ?? []) {
      await claudeEntityManager.writeProjectAgent(agent);
    }

    // Set up MCPs
    const mcpConfig: ClaudeMcpJsonConfig = {
      mcpServers: {},
    };
    for (const mcpServer of input.agentProfile.externalMCPs ?? []) {
      mcpConfig.mcpServers[mcpServer.name] = mcpServer;
    }

    // Write + install bundled MCP servers
    const mcpTempDir = path.join(os.tmpdir(), `mcp-${input.sessionId}`);
    await mkdir(mcpTempDir, { recursive: true });

    for (const mcpServer of input.agentProfile.bundledMCPs ?? []) {
      const mcpServerDir = path.join(mcpTempDir, mcpServer.name);
      await mkdir(mcpServerDir, { recursive: true });

      // Write all files for the MCP server
      for (const file of mcpServer.files ?? []) {
        await mkdir(path.join(mcpServerDir, path.dirname(file.path)), { recursive: true });
        await writeFile(path.join(mcpServerDir, file.path), file.content);
        filesWritten.push(path.join(mcpServerDir, file.path));
      }

      // Install MCP server deps
      if (mcpServer.installCommand) {
        await new Promise<void>((resolve, reject) => {
          exec(mcpServer.installCommand!, { cwd: mcpServerDir }, (error) => {
            if (error) reject(error);
            else resolve();
          });
        });
      }

      // Add MCP server to config
      mcpConfig.mcpServers[mcpServer.name] = {
        type: 'stdio',
        command: path.join(mcpServerDir, mcpServer.startCommand),
        args: [],
      };
    }

    // Write the MCP config
    const mcpConfigPath = path.join(input.projectDirPath, '.claude', '.mcp.json');
    await mkdir(path.dirname(mcpConfigPath), { recursive: true });
    await writeFile(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
    filesWritten.push(mcpConfigPath);

    // If opencode, add the adapter plugin
    if (input.architectureType === 'opencode') {
      const adapterPath = '/app/opencode-adapter';
      const opencodeConfig: OpencodeSettings = {
        plugin: [adapterPath],
      };
      const opencodeConfigPath = path.join(input.projectDirPath, 'opencode.json');
      await writeFile(opencodeConfigPath, JSON.stringify(opencodeConfig, null, 2));
      filesWritten.push(opencodeConfigPath);
    }

    return {
      success: true,
      filesWritten,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(errorMessage);
    return {
      success: false,
      filesWritten,
      errors,
    };
  }
}
