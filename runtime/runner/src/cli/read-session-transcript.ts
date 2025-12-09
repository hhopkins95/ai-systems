#!/usr/bin/env tsx
/**

 */

import { Command } from 'commander';
import * as path from 'path';
import { CombinedClaudeTranscript } from '@hhopkins/agent-converters/claude-sdk';
import {
    writeError,
    logDebug,
} from './shared/output.js';
import {
    setupSignalHandlers,
    setupExceptionHandlers,
} from './shared/signal-handlers.js';
import { getClaudeTranscriptDir } from '../helpers/getClaudeTranscriptDir.js';
import { readdir, readFile , } from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';

// Set up exception handlers early
setupExceptionHandlers();

// =============================================================================
// Main
// =============================================================================

const program = new Command()
    .name('read-session-transcript')
    .description('Read and combine session transcript files')
    .argument('<session-id>', 'The session ID')
    .requiredOption('-a, --architecture <arch>', 'Architecture: claude-sdk or opencode')
    .requiredOption('-p, --project-dir <path>', 'Project directory');



async function readClaudeSdkTranscript(sessionId: string, projectDir: string): Promise<string | null> {
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
            const subagents: { id: string, transcript: string }[] = [];
            for (const file of files) {
                // Extract just the filename (listFiles with find returns full paths)
                const filename = path.basename(file);
                const subagentId = filename.replace('.jsonl', '');
                const content = await readFile(file, 'utf-8');
                const transcript = content ?? "";

                // Filter out placeholder subagent files at read level
                // Claude Code creates shell files with only 1 JSONL line when CLI starts
                const lines = transcript.trim().split('\n').filter(l => l.trim().length > 0);
                if (lines.length <= 1) {
                    logDebug(`Skipping placeholder subagent transcript: ${subagentId}`, { lines: lines.length });
                    continue;
                }

                if (transcript.includes(sessionId)) {
                    // make sure the base session id is somewhere in the path -- ensures that this subagent is a subagent of the proper session. Should be good enough to just filter if that string exists
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
            // If main transcript doesn't exist yet, return null
            return null;
    }
}


const execFileAsync = promisify(execFile);

async function readOpencodeTranscript(sessionId: string, projectDir: string): Promise<string | null> {
    try {
        const { stdout } = await execFileAsync('opencode', ['export', sessionId], {
            cwd: projectDir,
        });

        if (!stdout) {
            console.error('No stdout from opencode export command');
            return null;
        }

        return stdout;
    } catch (error) {
        console.error(`OpenCode export command failed:`, error);
        return null;
    }
}



export async function readSessionTranscript() {
    // Parse args when this function is called
    program.parse();

    const opts = program.opts();
    const sessionId = program.args[0];
    const architecture = opts.architecture;
    const projectDir = opts.projectDir;

    // Setup signal handlers
    setupSignalHandlers();

    let transcript: string | null;
    try {
        if (architecture === 'claude-sdk') {
            transcript = await readClaudeSdkTranscript(sessionId, projectDir);
        } else if (architecture === 'opencode') {
            transcript = await readOpencodeTranscript(sessionId, projectDir);
        } else {
            throw new Error(`Unknown architecture: ${architecture}`);
        }

        if (!transcript) {
            throw new Error(`No transcript found for session: ${sessionId}`);
        }

        // write the transcript to stdout
        process.stdout.write(transcript);

        process.exit(0);
    } catch (error) {
        writeError(error as Error);
        process.exit(1);
    }
}
