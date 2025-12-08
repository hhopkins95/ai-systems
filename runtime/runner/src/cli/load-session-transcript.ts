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

import { AGENT_ARCHITECTURE_TYPE, CombinedClaudeTranscript } from '@ai-systems/shared-types';
import { mkdir, writeFile } from 'fs/promises';
import os from 'os';
import { join } from 'path';
import { readStdinJson } from './shared/input.js';
import { setupExceptionHandlers } from './shared/signal-handlers.js';
import { writeJson } from './shared/output.js';

// Set up exception handlers early
setupExceptionHandlers();

export type LoadSessionTranscriptInput = {
    projectDirPath: string,
    sessionTranscript: string,
    sessionId: string,
    architectureType: AGENT_ARCHITECTURE_TYPE
}

export type LoadSessionTranscriptResult = {
    success: boolean,
    errors?: string[]
}
/**
 * Write session transcript for Claude SDK
 * Location: ~/.claude/projects/{projectHash}/{sessionId}.jsonl
 */
async function writeClaudeTranscript(
  projectDir: string,
  sessionId: string,
  transcript: string
): Promise<string> {


  const homeDir = os.homedir()
  const projectId = projectDir.replace('/', '-').replace(' ', '-');
  const transcriptDir = join(homeDir, '.claude', 'projects', projectId);
  await mkdir(transcriptDir, { recursive: true });


  // read the transcript file as the combined json 
  let transcriptJson = JSON.parse(transcript) as CombinedClaudeTranscript

  // write the main transcript file
  const transcriptPath = join(transcriptDir, `${sessionId}.jsonl`);
  await writeFile(transcriptPath, transcriptJson.main, 'utf-8');

  // write the subagent transcripts files
  for (const subagent of transcriptJson.subagents) {
    const subagentPath = join(transcriptDir, `agent-${subagent.id}.jsonl`);
    await writeFile(subagentPath, subagent.transcript, 'utf-8');
  }

  return transcriptPath;
}

/**
 * Write session transcript for OpenCode
 * Uses opencode import CLI command
 */
async function writeOpencodeTranscript(
  sessionId: string,
  transcript: string
): Promise<string> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const os = await import('os');
  const execAsync = promisify(exec);

  // Write to temp file
  const tempPath = join(os.tmpdir(), `session-${sessionId}.json`);
  await writeFile(tempPath, transcript, 'utf-8');

  try {
    // Import via OpenCode CLI
    await execAsync(`opencode import "${tempPath}"`);
    return tempPath;
  } finally {
    // Clean up temp file
    try {
      const { unlink } = await import('fs/promises');
      await unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}


// =============================================================================
// Main
// =============================================================================

async function main() {
    const errors: string[] = [];
    try {

        const input = await readStdinJson<LoadSessionTranscriptInput>();

        if (input.architectureType === 'claude-agent-sdk') {
            await writeClaudeTranscript(input.projectDirPath, input.sessionId, input.sessionTranscript);
        } else if (input.architectureType === 'opencode') {
            await writeOpencodeTranscript(input.sessionId, input.sessionTranscript);
        }

        const result: LoadSessionTranscriptResult = {
            success: true,
        };

        writeJson(result);
        process.exit(0);

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(errorMessage);

        const result: LoadSessionTranscriptResult = {
            success: false,
            errors,
        };

        writeJson(result);
        process.exit(1);
    }
}

main();
