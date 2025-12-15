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
  McpServer,
  OpencodeSettings,
} from '@ai-systems/shared-types';
import { ClaudeEntityManager } from '@hhopkins/claude-entity-manager';
import { OpenCodeEntityWriter } from '@ai-systems/opencode-entity-manager';
import { getWorkspacePaths } from '../helpers/get-workspace-paths';


/**
 * Input for loading an agent profile.
 */
export interface LoadAgentProfileInput {
  baseWorkspacePath: string;
  agentProfile: AgentProfile;
  architectureType: AgentArchitecture;
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


  const paths = getWorkspacePaths({baseWorkspacePath: input.baseWorkspacePath});


  try {
    // Always set up the profile for Claude. If opencode, we add the adapter plugin.
    const claudeEntityManager = new ClaudeEntityManager({
      projectDir: input.baseWorkspacePath,
      claudeDir: paths.claudeConfigDir,
    });

    // Install all plugins for the agent profile
    const plugins = input.agentProfile.plugins ?? [];
    for (const plugin of plugins) {
      await claudeEntityManager.installPlugin(plugin);
    }

    // Add all custom entities
    for (const skill of input.agentProfile.customEntities.skills ?? []) {
      await claudeEntityManager.writeSkill(skill, { scope: 'global' });
    }
    for (const command of input.agentProfile.customEntities.commands ?? []) {
      await claudeEntityManager.writeCommand(command, { scope: 'global' });
    }
    for (const agent of input.agentProfile.customEntities.subagents ?? []) {
      await claudeEntityManager.writeAgent(agent, { scope: 'global' });
    }
    for (const rule of input.agentProfile.customEntities.rules ?? []) {
      await claudeEntityManager.writeRule(rule, { scope: 'global' });
    }

  

    let mcpServers: McpServer[] = input.agentProfile.externalMCPs ?? [];

    // Write + install bundled MCP servers
    for (const mcpServer of input.agentProfile.bundledMCPs ?? []) {
      const mcpServerDir = path.join(paths.bundledMCPsDir, mcpServer.name);
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

      mcpServers.push({
        name: mcpServer.name,
        type: 'stdio',
        command: path.join(mcpServerDir, mcpServer.startCommand),
        args: [],
      });
    }

    // Write the MCP config
    await claudeEntityManager.writeMcpServers(mcpServers, { scope: 'global' });

    // If opencode, add the adapter plugin
    if (input.architectureType === 'opencode') {

      /**
       * pull from the claude entity manager to account for plugin-installed entities
       */
      const fullAgentContext = await claudeEntityManager.loadAgentContext()
      const opencodeEntityManager = new OpenCodeEntityWriter({
        configDirectory : paths.opencodeConfigDir,
        configFilePath : paths.opencodeConfigFile,
      })

      await opencodeEntityManager.syncAgents(fullAgentContext.subagents)
      await opencodeEntityManager.syncSkills(fullAgentContext.skills)
      await opencodeEntityManager.syncCommands(fullAgentContext.commands)
      await opencodeEntityManager.writeInstructions(fullAgentContext.rules)
      await opencodeEntityManager.syncMcpServers(mcpServers)
      await opencodeEntityManager.writeSkillsInstructions(fullAgentContext.skills)
      await opencodeEntityManager.addPlugins(['opencode-skills'])

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
