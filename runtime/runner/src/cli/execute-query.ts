#!/usr/bin/env tsx
/**
 * Unified Execute Query - Runs inside sandbox
 *
 * Executes agent queries using either Claude SDK or OpenCode,
 * converting native SDK output to StreamEvents before outputting.
 *
 * Usage:
 *   Reads JSON input from stdin with the following structure:
 *   {
 *     "prompt": string,           // The user's message/prompt
 *     "architecture": string,     // "claude-sdk" or "opencode"
 *     "sessionId": string,        // The session ID
 *     "cwd": string,              // Working directory (default: /workspace)
 *     "model": string,            // Model for opencode (provider/model format)
 *     "tools": string[],          // Allowed tools
 *     "mcpServers": object        // MCP server configs
 *   }
 *
 * Output:
 *   Streams JSONL to stdout, one StreamEvent per line
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseStreamEvent } from '@hhopkins/agent-converters/claude-sdk';
import { createStreamEventParser } from '@hhopkins/agent-converters/opencode';
import type { ExecuteQueryArgs, AgentArchitecture } from '../types.js';
import {
  writeStreamEvents,
  writeError,
  logDebug,
  writeLog,
} from './shared/output.js';
import {
  setupSignalHandlers,
  setupExceptionHandlers,
} from './shared/signal-handlers.js';
import { readStdinJson } from './shared/input.js';
import { query, Options } from "@anthropic-ai/claude-agent-sdk"
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';


const execAsync = promisify(exec);

// =============================================================================
// Claude Code Path Detection
// =============================================================================

/**
 * Find the Claude Code executable in PATH
 */
async function findClaudeCodeExecutable(): Promise<string | undefined> {
  try {
    const { stdout } = await execAsync('which claude');
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

// Set up exception handlers early
setupExceptionHandlers();

// =============================================================================
// Session Helpers
// =============================================================================

/**
 * Check if a Claude SDK session transcript exists
 */
function claudeSessionExists(sessionId: string): boolean {
  const projectsDir = path.join(process.env.HOME || '~', '.claude', 'projects');

  if (!fs.existsSync(projectsDir)) {
    return false;
  }

  // Scan all subdirectories for {sessionId}.jsonl
  const projectDirs = fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const dir of projectDirs) {
    const transcriptPath = path.join(projectsDir, dir, `${sessionId}.jsonl`);
    if (fs.existsSync(transcriptPath)) {
      return true;
    }
  }

  return false;
}

// =============================================================================
// Claude SDK Executor
// =============================================================================

async function executeClaudeSdk(args: ExecuteQueryArgs): Promise<void> {
  writeLog('info', 'Runner started (claude-sdk)', {
    sessionId: args.sessionId,
    cwd: args.cwd,
  });
  logDebug('Starting Claude SDK execution', { sessionId: args.sessionId });

  // Validate environment
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY environment variable not set');
  }

  // Find Claude Code executable
  const claudeCodePath = await findClaudeCodeExecutable();
  if (!claudeCodePath) {
    throw new Error(
      'Claude Code executable not found in PATH. Install with: npm install -g @anthropic-ai/claude-code'
    );
  }
  logDebug('Found Claude Code executable', { path: claudeCodePath });


  const options: Options = {
    pathToClaudeCodeExecutable: claudeCodePath,
    cwd: args.cwd || '/workspace',
    settingSources: ['project', 'user'],
    includePartialMessages: true,
    maxBudgetUsd: 5.0,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    allowedTools: args.tools
      ? [...args.tools, 'Skill']
      : ['Skill'],
    mcpServers: args.mcpServers as Options['mcpServers'],
  };

  const needsCreation = !claudeSessionExists(args.sessionId);
  logDebug('Session check', { sessionId: args.sessionId, needsCreation });

  writeLog('info', 'Calling Claude SDK query()', {
    sessionId: args.sessionId,
    needsCreation,
  });


  const generator = query({
    prompt: args.prompt,
    // options
    options: needsCreation
      ? { ...options, extraArgs: { 'session-id': args.sessionId } }
      : { ...options, resume: args.sessionId },
  });

  let firstEventReceived = false;
  for await (const sdkMessage of generator) {
    if (!firstEventReceived) {
      firstEventReceived = true;
      writeLog('info', 'First event received from SDK');
    }
    // Convert SDK message to StreamEvents using converter
    const streamEvents = parseStreamEvent(sdkMessage);
    writeStreamEvents(streamEvents);
  }
}

// =============================================================================
// OpenCode Executor
// =============================================================================

async function executeOpencode(args: ExecuteQueryArgs): Promise<void> {
  writeLog('info', 'Runner started (opencode)', {
    sessionId: args.sessionId,
    model: args.model,
  });
  logDebug('Starting OpenCode execution', { sessionId: args.sessionId });

  if (!args.model) {
    throw new Error('Model is required for opencode architecture (format: provider/model)');
  }

  const [providerID, modelID] = args.model.split('/');
  if (!providerID || !modelID) {
    throw new Error('Model must be in format provider/model (e.g., anthropic/claude-sonnet-4-20250514)');
  }

  // Dynamic import of OpenCode SDK
  const { createOpencode } = await import('@opencode-ai/sdk');

  const oc = await createOpencode({ hostname: '127.0.0.1', port: 4096 });
  const client = oc.client;
  const server = oc.server;

  // Setup cleanup on signals
  setupSignalHandlers(() => server?.close());

  try {
    // Create stateful parser for this session
    const parser = createStreamEventParser(args.sessionId);

    // Check if session exists, create if not
    const existingSession = await client.session.get({ path: { id: args.sessionId } });
    logDebug('Session check', { sessionId: args.sessionId, exists: !!existingSession.data });

    if (!existingSession.data) {
      logDebug('Creating new session', { sessionId: args.sessionId });
      await createOpencodeSession(args.sessionId, args.cwd || '/workspace');
    }

    // Start event subscription in parallel (IMPORTANT: must start before prompt)
    const eventPromise = (async () => {
      const events = await client.event.subscribe();

      let firstEventReceived = false;
      for await (const event of events.stream) {
        if (!firstEventReceived) {
          firstEventReceived = true;
          writeLog('info', 'First event received from OpenCode', {
            eventType: event.type,
          });
        }

        // Convert OpenCode event to StreamEvents using stateful parser
        const streamEvents = parser.parseEvent(event);
       
        writeStreamEvents(streamEvents);

        // Break when session goes idle
        if (event.type === 'session.idle' && event.properties.sessionID === args.sessionId) {
          break;
        }
      }
    })();

    // Authenticate
    await client.auth.set({
      path: { id: 'zen' },
      body: { type: 'api', key: process.env.OPENCODE_API_KEY || '' },
    });

    // Send prompt
    writeLog('info', 'Sending prompt to OpenCode', {
      sessionId: args.sessionId,
      providerID,
      modelID,
    });

    await client.session.prompt({
      path: { id: args.sessionId },
      body: {
        model: { providerID, modelID },
        parts: [{ type: 'text', text: args.prompt }],
      },
    });

    // Wait for event stream to complete
    await eventPromise;
  } finally {
    server?.close();
  }
}

/**
 * Create an OpenCode session with a specific ID
 */
async function createOpencodeSession(sessionId: string, cwd: string): Promise<void> {
  const sessionFileContents = JSON.stringify({
    info: {
      id: sessionId,
      version: '1.0.120',
      projectID: 'global',
      directory: cwd,
      title: 'New Session',
      time: {
        created: Date.now(),
        updated: Date.now(),
      },
      summary: {
        additions: 0,
        deletions: 0,
        files: 0,
      },
    },
    messages: [],
  }, null, 2);

  const filePath = path.join(os.tmpdir(), `temp-${sessionId}.json`);
  fs.writeFileSync(filePath, sessionFileContents);

  // Verify file exists
  if (!fs.existsSync(filePath)) {
    throw new Error(`File was not created at ${filePath}`);
  }

  try {
    await execAsync(`opencode import "${filePath}"`);
  } finally {
    // Clean up temp file
    try {
      fs.unlinkSync(filePath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

// =============================================================================
// Main
// =============================================================================

/**
 * Input structure for execute-query (read from stdin)
 */
interface ExecuteQueryInput {
  prompt: string;
  architecture: AgentArchitecture;
  sessionId: string;
  cwd?: string;
  model?: string;
  tools?: string[];
  mcpServers?: Record<string, unknown>;
}

export async function executeQuery() {
  // Read input from stdin
  const input = await readStdinJson<ExecuteQueryInput>();

  writeLog('info', 'Executing query', {
    architecture: input.architecture,
    sessionId: input.sessionId,
    cwd: input.cwd,
  });

  const args: ExecuteQueryArgs = {
    prompt: input.prompt,
    sessionId: input.sessionId,
    architecture: input.architecture,
    cwd: input.cwd || '/workspace',
    model: input.model,
    tools: input.tools,
    mcpServers: input.mcpServers,
  };

  logDebug('Executing query', {
    architecture: args.architecture,
    sessionId: args.sessionId,
    cwd: args.cwd,
  });

  // Setup default signal handlers
  setupSignalHandlers();

  try {
    if (args.architecture === 'claude-sdk') {
      await executeClaudeSdk(args);
    } else if (args.architecture === 'opencode') {
      await executeOpencode(args);
    } else {
      throw new Error(`Unknown architecture: ${args.architecture}`);
    }

    process.exit(0);
  } catch (error) {
    writeLog('error', 'Query execution failed', {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    writeError(error as Error);
    process.exit(1);
  }
}
