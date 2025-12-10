#!/usr/bin/env tsx
/**

 */

import { AgentArchitecture, CombinedClaudeTranscript } from '@ai-systems/shared-types';
import { mkdir, writeFile } from 'fs/promises';
import os from 'os';
import { join } from 'path';
import { readStdinJson } from './shared/input.js';
import { setupExceptionHandlers } from './shared/signal-handlers.js';
import { writeJson, writeLog } from './shared/output.js';
import { getClaudeTranscriptDir } from '../helpers/getClaudeTranscriptDir.js';

// Set up exception handlers early
setupExceptionHandlers();

export type LoadSessionTranscriptInput = {
    projectDirPath: string,
    sessionTranscript: string,
    sessionId: string,
    architectureType: AgentArchitecture
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

  const transcriptDir = await getClaudeTranscriptDir(projectDir);

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

export async function loadSessionTranscript() {
    const errors: string[] = [];
    try {

        const input = await readStdinJson<LoadSessionTranscriptInput>();

        writeLog('info', 'Loading session transcript', {
            sessionId: input.sessionId,
            architecture: input.architectureType,
        });

        if (input.architectureType === 'claude-sdk') {
            await writeClaudeTranscript(input.projectDirPath, input.sessionId, input.sessionTranscript);
        } else if (input.architectureType === 'opencode') {
            await writeOpencodeTranscript(input.sessionId, input.sessionTranscript);
        }

        writeLog('info', 'Session transcript loaded');

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
