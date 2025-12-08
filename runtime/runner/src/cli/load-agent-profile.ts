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
import { join } from 'path';
import { readStdinJson } from './shared/input.js';
import { logDebug, writeSetupResult } from './shared/output.js';
import { setupExceptionHandlers } from './shared/signal-handlers.js';
import { AGENT_ARCHITECTURE_TYPE, AgentProfile } from '@ai-systems/shared-types';

// Set up exception handlers early
setupExceptionHandlers();

export type LoadAgentProfileInput = {
    projectDirPath: string,
    agentProfile: AgentProfile,
    architectureType: AGENT_ARCHITECTURE_TYPE
}

export type LoadAgentProfileResult = {
    success: boolean,
    filesWritten: string[],
    errors?: string[]
}

// =============================================================================
// Main
// =============================================================================

async function main() {
    const filesWritten: string[] = [];
    const errors: string[] = [];

    try {




    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(errorMessage);

        const result: LoadAgentProfileResult = {
            success: false,
            filesWritten,
            errors,
        };

        writeSetupResult(result);
        process.exit(1);
    }
}

main();
