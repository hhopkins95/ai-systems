#!/usr/bin/env tsx
/**

 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { CombinedClaudeTranscript, parseStreamEvent } from '@hhopkins/agent-converters/claude-sdk';
import { createStreamEventParser } from '@hhopkins/agent-converters/opencode';
import {
    writeStreamEvents,
    writeError,
    logDebug,
} from './shared/output.js';
import {
    setupSignalHandlers,
    setupExceptionHandlers,
} from './shared/signal-handlers.js';
import { getClaudeTranscriptDir } from '../helpers/getClaudeTranscriptDir.js';
import { readdir, readFile , } from 'fs/promises';
import { exec } from 'child_process';
import { readStreamToString } from './shared/stream.js';

// Set up exception handlers early
setupExceptionHandlers();

// =============================================================================
// Main
// =============================================================================

const program = new Command()
    .name('execute-query')
    .description('Execute agent query with unified StreamEvent output')
    .argument('<session-id>', 'The session ID')
    .requiredOption('-a, --architecture <arch>', 'Architecture: claude-sdk or opencode')
    .requiredOption('-p, --project-dir <path>', 'Project directory')
    .parse();



async function readClaudeSdkTranscript(sessionId: string, projectDir: string): Promise<string | null> {
    const transcriptDir = await getClaudeTranscriptDir(projectDir);
    const mainTranscriptPath = `${transcriptDir}/${sessionId}.jsonl`;

        try {
            // Read main transcript
            const mainContent = await readFile(mainTranscriptPath, 'utf-8');

            if (!mainContent) {
                return null;
            }

            // List all files in storage directory (pattern to find agent-*.jsonl)
            const files = await readdir(transcriptDir, 'agent-*.jsonl');

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


async function readOpencodeTranscript(sessionId: string, projectDir: string): Promise<string | null> {
//     const result = await this.sandbox.exec(['opencode', 'export', this.sessionId]);
//     const exitCode = await result.wait();

//     // Read all stdout content using universal stream helper
//     const stdout = await readStreamToString(result.stdout);

//     if (exitCode !== 0) {
//       const stderr = await readStreamToString(result.stderr);
//       logger.error({ exitCode, stderr, sessionId: this.sessionId }, 'OpenCode export command failed');
//       return null;
//     }
//     return stdout || null;

const result = await exec(`opencode export ${sessionId}`);
const exitCode = result.exitCode;

if (exitCode !== 0) {
    console.error(`OpenCode export command failed: ${exitCode}`);
    return null;
}

if (!result.stdout) {
    console.error(`No stdout found for OpenCode export command`);
    return null;
}

const stdout = await readStreamToString(result.stdout as ReadableStream<string>);
    return ''
}



async function main() {
    const opts = program.opts();

    const sessionId = program.args[0];
    const architecture = opts.architecture;
    const projectDir = opts.projectDir;


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

// Setup default signal handlers
setupSignalHandlers();

// Run
main();
