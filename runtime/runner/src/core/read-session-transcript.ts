/**
 * Read session transcript core logic.
 *
 * Reads and combines session transcript files.
 */

import * as path from 'path';
import { readdir, readFile } from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { AgentArchitecture } from '@ai-systems/shared-types';
import { CombinedClaudeTranscript } from '@hhopkins/agent-converters/claude-sdk';
import { getClaudeTranscriptDir } from '../helpers/getClaudeTranscriptDir.js';

const execFileAsync = promisify(execFile);

/**
 * Input for reading a session transcript.
 */
export interface ReadSessionTranscriptInput {
  sessionId: string;
  architecture: AgentArchitecture;
  projectDir: string;
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
 */
async function readClaudeSdkTranscript(
  sessionId: string,
  projectDir: string
): Promise<string | null> {
  const transcriptDir = await getClaudeTranscriptDir(projectDir);
  const mainTranscriptPath = `${transcriptDir}/${sessionId}.jsonl`;

  try {
    // Read main transcript
    const mainContent = await readFile(mainTranscriptPath, 'utf-8');

    if (!mainContent) {
      return null;
    }

    // List all files in storage directory and filter for agent-*.jsonl
    const allFiles = await readdir(transcriptDir);
    const files = allFiles
      .filter(f => f.startsWith('agent-') && f.endsWith('.jsonl'))
      .map(f => path.join(transcriptDir, f));

    // Read all subagent transcripts
    const subagents: { id: string; transcript: string }[] = [];
    for (const file of files) {
      const filename = path.basename(file);
      const subagentId = filename.replace('.jsonl', '');
      const content = await readFile(file, 'utf-8');
      const transcript = content ?? '';

      // Filter out placeholder subagent files at read level
      // Claude Code creates shell files with only 1 JSONL line when CLI starts
      const lines = transcript.trim().split('\n').filter(l => l.trim().length > 0);
      if (lines.length <= 1) {
        continue;
      }

      if (transcript.includes(sessionId)) {
        // Make sure the base session ID is somewhere in the path
        subagents.push({ id: subagentId, transcript });
      }
    }

    // Combine into our unified format
    const combined: CombinedClaudeTranscript = {
      main: mainContent,
      subagents,
    };

    return JSON.stringify(combined);
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

    if (input.architecture === 'claude-sdk') {
      transcript = await readClaudeSdkTranscript(input.sessionId, input.projectDir);
    } else if (input.architecture === 'opencode') {
      transcript = await readOpencodeTranscript(input.sessionId, input.projectDir);
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
