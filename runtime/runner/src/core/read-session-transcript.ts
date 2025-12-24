/**
 * Read session transcript core logic.
 *
 * Reads and combines session transcript files.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, unlink } from 'fs/promises';
import { join } from 'path';
import os from 'os';
import type { AgentArchitecture, OpenCodeSessionTranscript, CombinedOpenCodeTranscript } from '@ai-systems/shared-types';
import { extractSubagentSessionIds } from '../../../../packages/state/dist';
import { ClaudeEntityManager } from '@hhopkins/claude-entity-manager';
import { getWorkspacePaths } from '../helpers/get-workspace-paths';
import { setEnvironment } from '../helpers/set-environment';

const execAsync = promisify(exec);

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
 * Export a single OpenCode session using temp file to avoid buffer limits.
 * Returns raw JSON string content.
 */
async function exportOpencodeSession(sessionId: string): Promise<string | null> {
  const tempPath = join(os.tmpdir(), `opencode-export-${sessionId}-${Date.now()}.json`);

  try {
    // Export to temp file to avoid buffer size issues
    await execAsync(`opencode export "${sessionId}" > "${tempPath}"`);

    // Read the temp file
    const content = await readFile(tempPath, 'utf-8');

    if (!content) {
      return null;
    }

    // Find the start of valid JSON (should be '{')
    // opencode export may output non-JSON content before the JSON
    const jsonStart = content.indexOf('{');
    if (jsonStart === -1) {
      console.error(`OpenCode export did not return JSON object. Output: ${content.substring(0, 100)}...`);
      return null;
    }

    const jsonContent = content.substring(jsonStart);

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
  } finally {
    // Clean up temp file
    try {
      await unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Read OpenCode session transcript with subagents.
 * Returns combined format with main transcript and all subagent transcripts.
 */
async function readOpencodeTranscript(
  sessionId: string,
  _projectDir: string
): Promise<string | null> {
  // 1. Export main session
  const mainContent = await exportOpencodeSession(sessionId);
  if (!mainContent) {
    return null;
  }

  // 2. Parse and extract subagent session IDs
  let transcript: OpenCodeSessionTranscript;
  try {
    transcript = JSON.parse(mainContent) as OpenCodeSessionTranscript;
  } catch {
    console.error(`Failed to parse main transcript JSON`);
    return null;
  }

  const subagentIds = extractSubagentSessionIds(transcript);

  // 3. Fetch each subagent (log failures, continue)
  const subagents: { id: string; transcript: string }[] = [];
  for (const subId of subagentIds) {
    const subContent = await exportOpencodeSession(subId);
    if (subContent) {
      subagents.push({ id: subId, transcript: subContent });
    } else {
      console.warn(`Failed to fetch subagent ${subId}, skipping`);
    }
  }

  // 4. Return combined transcript
  const combined: CombinedOpenCodeTranscript = {
    main: mainContent,
    subagents,
  };

  return JSON.stringify(combined);
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
