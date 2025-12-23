/**
 * Load session transcript core logic.
 *
 * Writes session transcript files for Claude SDK or OpenCode.
 */

import { writeFile, unlink } from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import { join } from 'path';
import type { AgentArchitecture, CombinedClaudeTranscript, CombinedOpenCodeTranscript } from '@ai-systems/shared-types';
import { ClaudeEntityManager } from '@hhopkins/claude-entity-manager';
import { getWorkspacePaths } from '../helpers/get-workspace-paths';
import { setEnvironment } from '../helpers/set-environment';

const execAsync = promisify(exec);

/**
 * Input for loading a session transcript.
 */
export interface LoadSessionTranscriptInput {
  baseWorkspacePath: string;
  sessionTranscript: string;
  sessionId: string;
  architectureType: AgentArchitecture;
}

/**
 * Result of loading a session transcript.
 */
export interface LoadSessionTranscriptResult {
  success: boolean;
  transcriptPath?: string;
  errors?: string[];
}

/**
 * Write session transcript for Claude SDK.
 * Location: ~/.claude/projects/{projectHash}/{sessionId}.jsonl
 * Uses ClaudeEntityManager for unified session management.
 */
async function writeClaudeTranscript(
  projectDir: string,
  sessionId: string,
  transcript: string,
  claudeDir: string
): Promise<string> {
  const manager = new ClaudeEntityManager({ projectDir, claudeDir: claudeDir });
  const transcriptJson = JSON.parse(transcript) as CombinedClaudeTranscript;
  return manager.writeSessionRaw(sessionId, transcriptJson);
}

/**
 * Write session transcript for OpenCode.
 * Uses opencode import CLI command.
 * Handles combined format with main transcript and subagents.
 */
async function writeOpencodeTranscript(
  sessionId: string,
  transcript: string
): Promise<string> {
  // Parse combined format
  const combined = JSON.parse(transcript) as CombinedOpenCodeTranscript;

  // Import main transcript
  const mainTempPath = join(os.tmpdir(), `session-${sessionId}.json`);
  await writeFile(mainTempPath, combined.main, 'utf-8');
  try {
    await execAsync(`opencode import "${mainTempPath}"`);
  } finally {
    await unlink(mainTempPath).catch(() => {});
  }

  // Import each subagent transcript
  for (const { id, transcript: subTranscript } of combined.subagents) {
    const subTempPath = join(os.tmpdir(), `session-${id}.json`);
    await writeFile(subTempPath, subTranscript, 'utf-8');
    try {
      await execAsync(`opencode import "${subTempPath}"`);
    } catch (error) {
      console.warn(`Failed to import subagent ${id}, skipping`);
    } finally {
      await unlink(subTempPath).catch(() => {});
    }
  }

  return mainTempPath;
}

/**
 * Load a session transcript into the environment.
 *
 * @param input - Transcript loading parameters
 * @returns Result with success status and transcript path
 */
export async function loadSessionTranscript(
  input: LoadSessionTranscriptInput
): Promise<LoadSessionTranscriptResult> {
  const errors: string[] = [];

  const paths = getWorkspacePaths({baseWorkspacePath: input.baseWorkspacePath});
  setEnvironment({baseWorkspacePath: input.baseWorkspacePath});

  try {
    let transcriptPath: string;

    if (input.architectureType === 'claude-sdk') {
      transcriptPath = await writeClaudeTranscript(
        paths.workspaceDir,
        input.sessionId,
        input.sessionTranscript,
        paths.claudeConfigDir
      );
    } else if (input.architectureType === 'opencode') {
      transcriptPath = await writeOpencodeTranscript(
        input.sessionId,
        input.sessionTranscript
      );
    } else {
      throw new Error(`Unknown architecture: ${input.architectureType}`);
    }

    return {
      success: true,
      transcriptPath,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(errorMessage);
    return {
      success: false,
      errors,
    };
  }
}
