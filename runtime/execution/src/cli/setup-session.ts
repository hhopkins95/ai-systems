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

import { mkdir, writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import { EntityWriter } from '@hhopkins/claude-entity-manager';
import type {
  SetupSessionInput,
  SetupSessionResult,
  McpServerConfig,
} from '../types.js';
import { writeSetupResult, logDebug } from './shared/output.js';
import { setupExceptionHandlers } from './shared/signal-handlers.js';

// Set up exception handlers early
setupExceptionHandlers();

// =============================================================================
// Input Reading
// =============================================================================

/**
 * Read JSON input from stdin
 */
async function readStdinJson<T>(): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  const input = Buffer.concat(chunks).toString('utf-8');

  if (!input.trim()) {
    throw new Error('No input received via stdin');
  }

  return JSON.parse(input) as T;
}

// =============================================================================
// MCP Configuration (OpenCode-specific)
// =============================================================================

/**
 * Write opencode.config.json for OpenCode architecture
 * Note: Claude SDK MCP config is handled by EntityWriter
 */
async function writeOpencodeConfig(
  projectDir: string,
  servers: Record<string, McpServerConfig>
): Promise<string> {
  const configPath = join(projectDir, 'opencode.config.json');

  // OpenCode config format
  const config = {
    mcp: Object.fromEntries(
      Object.entries(servers).map(([name, cfg]) => [
        name,
        {
          command: cfg.command,
          args: cfg.args || [],
          env: cfg.env,
        },
      ])
    ),
  };

  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  return configPath;
}

// =============================================================================
// Transcript Writing
// =============================================================================

/**
 * Generate a hash for a project path (used by Claude SDK for transcript location)
 */
function hashProjectPath(projectPath: string): string {
  return createHash('sha256')
    .update(projectPath)
    .digest('hex')
    .substring(0, 16);
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
  const homeDir = process.env.HOME || '/root';
  const projectHash = hashProjectPath(projectDir);
  const transcriptDir = join(homeDir, '.claude', 'projects', projectHash);

  await mkdir(transcriptDir, { recursive: true });

  const transcriptPath = join(transcriptDir, `${sessionId}.jsonl`);
  await writeFile(transcriptPath, transcript, 'utf-8');

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
  const filesWritten: string[] = [];
  const errors: string[] = [];

  try {
    // Read input from stdin
    logDebug('Reading input from stdin');
    const input = await readStdinJson<SetupSessionInput>();

    // Validate input
    if (!input.projectDir) {
      throw new Error('projectDir is required');
    }

    if (!input.architecture) {
      throw new Error('architecture is required');
    }

    logDebug('Setup session input received', {
      projectDir: input.projectDir,
      architecture: input.architecture,
      hasEntities: !!input.entities,
      hasTranscript: !!input.sessionTranscript,
      hasMcpServers: !!input.mcpServers,
    });

    // Ensure project directory exists
    await mkdir(input.projectDir, { recursive: true });

    // Write entities if provided
    if (input.entities && Object.keys(input.entities).length > 0) {
      logDebug('Writing entities', {
        skills: input.entities.skills?.length || 0,
        commands: input.entities.commands?.length || 0,
        agents: input.entities.agents?.length || 0,
        hooks: input.entities.hooks?.length || 0,
        hasClaudeMd: !!input.entities.claudeMd,
      });

      const writer = new EntityWriter(input.projectDir);
      const results = await writer.writeEntities(input.entities);

      filesWritten.push(...results.skills.map(r => r.path));
      filesWritten.push(...results.commands.map(r => r.path));
      filesWritten.push(...results.agents.map(r => r.path));
      filesWritten.push(...results.hooks.map(r => r.path));
      if (results.claudeMd) {
        filesWritten.push(results.claudeMd.path);
      }
    }

    // Write MCP configuration
    if (input.mcpServers && Object.keys(input.mcpServers).length > 0) {
      logDebug('Writing MCP configuration', {
        serverCount: Object.keys(input.mcpServers).length,
        architecture: input.architecture,
      });

      if (input.architecture === 'claude-sdk') {
        // Use EntityWriter for Claude SDK MCP config
        const writer = new EntityWriter(input.projectDir);
        // Convert Record<string, McpServerConfig> to McpServerConfig[] with names
        const mcpServersArray = Object.entries(input.mcpServers).map(([name, config]) => ({
          ...config,
          name,
        }));
        const result = await writer.writeMcpServers(mcpServersArray);
        filesWritten.push(result.path);
      } else if (input.architecture === 'opencode') {
        const configPath = await writeOpencodeConfig(input.projectDir, input.mcpServers);
        filesWritten.push(configPath);
      }
    }

    // Write session transcript if resuming
    if (input.sessionTranscript && input.sessionId) {
      logDebug('Writing session transcript', {
        sessionId: input.sessionId,
        transcriptLength: input.sessionTranscript.length,
        architecture: input.architecture,
      });

      if (input.architecture === 'claude-sdk') {
        const transcriptPath = await writeClaudeTranscript(
          input.projectDir,
          input.sessionId,
          input.sessionTranscript
        );
        filesWritten.push(transcriptPath);
      } else if (input.architecture === 'opencode') {
        const transcriptPath = await writeOpencodeTranscript(
          input.sessionId,
          input.sessionTranscript
        );
        filesWritten.push(transcriptPath);
      }
    }

    const result: SetupSessionResult = {
      success: true,
      filesWritten,
    };

    writeSetupResult(result);
    process.exit(0);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(errorMessage);

    const result: SetupSessionResult = {
      success: false,
      filesWritten,
      errors,
    };

    writeSetupResult(result);
    process.exit(1);
  }
}

main();
