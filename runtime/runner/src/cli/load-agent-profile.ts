#!/usr/bin/env tsx
/**
 * Setup Session - Prepares sandbox environment
 *
 * Writes entity files and MCP configuration to the project directory.
 * Input is received via stdin as JSON.
 *
 * Usage:
 *   echo '{"projectDir":"/workspace",...}' | setup-session
 *   cat setup-input.json | setup-session
 *
 * Input (JSON via stdin):
 *   {
 *     "projectDir": "/workspace",
 *     "entities": { skills: [...], commands: [...], agents: [...], hooks: [...], claudeMd: "..." },
 *     "sessionTranscript": "...",
 *     "sessionId": "session-xxx",
 *     "mcpServers": { "server-name": { command: "...", args: [...] } },
 *     "architecture": "claude-sdk" | "opencode"
 *   }
 *
 * Output:
 *   JSON result to stdout: { success: boolean, filesWritten: string[], errors?: string[] }
 */

import { mkdir, writeFile } from 'fs/promises';
import path, { join } from 'path';
import { readStdinJson } from './shared/input.js';
import { logDebug, writePlainError } from './shared/output.js';
import { setupExceptionHandlers } from './shared/signal-handlers.js';
import { AgentArchitecture, AgentProfile, ClaudeMcpJsonConfig, OpencodeSettings } from '@ai-systems/shared-types';
import { ClaudeEntityManager} from '@hhopkins/claude-entity-manager';
import os from 'os';
import { exec } from 'child_process';
import { createRequire } from 'module';

// Set up exception handlers early
setupExceptionHandlers();

export type LoadAgentProfileInput = {
    projectDirPath: string,
    sessionId: string,
    agentProfile: AgentProfile,
    architectureType: AgentArchitecture
}

export type LoadAgentProfileResult = {
    success: boolean,
    filesWritten: string[],
    errors?: string[]
}


export async function loadAgentProfile() {
    try {
        const input = await readStdinJson<LoadAgentProfileInput>();

        // always just setup the profile for claude. If opencode, we just need to add the adapter plugin
        const claudeEntityManager = new ClaudeEntityManager({
            projectDir : input.projectDirPath,
        });


        // install all of the plugins for the agent profile
        for (const plugin of input.agentProfile.plugins ?? []) {
            await claudeEntityManager.installPlugin(plugin);
        }
        // add all of the other entities 
        for (const skill of input.agentProfile.customEntities.skills ?? []) {
            await claudeEntityManager.writeProjectSkill(skill);
        }
        for (const command of input.agentProfile.customEntities.commands ?? []) {
            await claudeEntityManager.writeProjectCommand(command);
        }
        for (const agent of input.agentProfile.customEntities.subagents ?? []) {
            await claudeEntityManager.writeProjectAgent(agent);
        }



        // setup mcps 
        let mcpConfig: ClaudeMcpJsonConfig = {
            mcpServers: {},
        };
        for (const mcpServer of input.agentProfile.externalMCPs ?? []) {
            mcpConfig.mcpServers[mcpServer.name] = mcpServer;
        }

        // write + install bundled mcp servers
        const mcpTempDir = path.join(os.tmpdir(), `mcp-${input.sessionId}`);
        await mkdir(mcpTempDir, { recursive: true });

        for (const mcpServer of input.agentProfile.bundledMCPs ?? []) {
            const mcpServerDir = path.join(mcpTempDir, mcpServer.name);
            await mkdir(mcpServerDir, { recursive: true });

            // write all of the files for the mcp server
            for (const file of mcpServer.files ?? []) {
                // create the directory if it doesn't exist
                await mkdir(path.join(mcpServerDir, path.dirname(file.path)), { recursive: true });
                await writeFile(path.join(mcpServerDir, file.path), file.content);
            }

            // install the mcp server deps 
            if (mcpServer.installCommand) {
                await exec(`${mcpServer.installCommand}`, { cwd: mcpServerDir });
            }

            // add the mcp server to the config
            mcpConfig.mcpServers[mcpServer.name] = {
                type : "stdio",
                // run the start command from the mcp dir 
                command: path.join(mcpServerDir, mcpServer.startCommand),
                args: [],
            };
        }


        // write the mcp config
        await writeFile(path.join(input.projectDirPath, '.claude', '.mcp.json'), JSON.stringify(mcpConfig, null, 2));



        // if opencode, we need to add the adapter plugin
        if (input.architectureType === 'opencode') {

            const require = createRequire(import.meta.url);
            const adapterPackageJson = require.resolve('@ai-systems/opencode-claude-adapter');
            const adapterPath = path.dirname(adapterPackageJson);

            const opencodeConfig : OpencodeSettings = {
                plugin: [adapterPath],
            }

            await writeFile(path.join(input.projectDirPath, 'opencode.json'), JSON.stringify(opencodeConfig, null, 2));

            
        }


    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        writePlainError(errorMessage);
        process.exit(1);
    }
}
