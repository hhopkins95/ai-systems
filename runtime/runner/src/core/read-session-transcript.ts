/**
 * Read session transcript core logic.
 *
 * Reads and combines session transcript files.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import type { AgentArchitecture } from '@ai-systems/shared-types';
import { ClaudeEntityManager } from '@hhopkins/claude-entity-manager';
import { getWorkspacePaths } from '../helpers/get-workspace-paths';
import { setEnvironment } from '../helpers/set-environment';

const execFileAsync = promisify(execFile);

/**
 * Input for reading a session transcript.
 */
export interface ReadSessionTranscriptInput {
  baseWorkspacePath: string;
  sessionId: string;
  architecture: AgentArchitecture;
}

/**
 * Result of reading a session transcript.
 */
export interface ReadSessionTranscriptResult {
  success: boolean;
  transcript?: string;
  error?: string;
}

/**
 * Read Claude SDK session transcript.
 * Uses ClaudeEntityManager for unified session management.
 */
async function readClaudeSdkTranscript(
  sessionId: string,
  projectDir: string,
  claudeHomeDir: string
): Promise<string | null> {
  const manager = new ClaudeEntityManager({ projectDir, claudeDir: claudeHomeDir });
  try {
    const transcript = await manager.readSessionRaw(sessionId);
    return JSON.stringify(transcript);
  } catch (error) {
    console.error(`Error reading session transcripts: ${error}`);
    return null;
  }
}

/**
 * Read OpenCode session transcript.
 */
async function readOpencodeTranscript(
  sessionId: string,
  projectDir: string
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('opencode', ['export', sessionId], {
      cwd: projectDir,
    });

    if (!stdout) {
      return null;
    }

    // Find the start of valid JSON (should be '{')
    // opencode export may output non-JSON content (like model identifiers) before the JSON
    const jsonStart = stdout.indexOf('{');
    if (jsonStart === -1) {
      console.error(`OpenCode export did not return JSON object. Output: ${stdout.substring(0, 100)}...`);
      return null;
    }

    const jsonContent = stdout.substring(jsonStart);

    // Validate it's valid JSON before returning
    try {
      JSON.parse(jsonContent);
      return jsonContent;
    } catch (parseError) {
      console.error(`OpenCode export returned invalid JSON. Content starts with: ${jsonContent.substring(0, 100)}...`);
      return null;
    }
  } catch (error) {
    console.error(`OpenCode export command failed:`, error);
    return null;
  }
}

/**
 * Read a session transcript from the environment.
 *
 * @param input - Transcript reading parameters
 * @returns Result with success status and transcript content
 */
export async function readSessionTranscript(
  input: ReadSessionTranscriptInput
): Promise<ReadSessionTranscriptResult> {
  try {
    let transcript: string | null;
    const paths = getWorkspacePaths({baseWorkspacePath: input.baseWorkspacePath});
    setEnvironment({baseWorkspacePath: input.baseWorkspacePath});

    if (input.architecture === 'claude-sdk') {
      transcript = await readClaudeSdkTranscript(input.sessionId, paths.workspaceDir, paths.claudeConfigDir);
    } else if (input.architecture === 'opencode') {
      transcript = await readOpencodeTranscript(input.sessionId, paths.workspaceDir);
    } else {
      throw new Error(`Unknown architecture: ${input.architecture}`);
    }

    if (!transcript) {
      return {
        success: false,
        error: `No transcript found for session: ${input.sessionId}`,
      };
    }

    return {
      success: true,
      transcript,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
