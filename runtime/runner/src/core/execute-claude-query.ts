/**
 * Claude SDK query execution.
 *
 * Pure async generator that yields StreamEvents from Claude SDK responses.
 */

import * as fs from 'fs';
import * as path from 'path';
import { query, Options } from '@anthropic-ai/claude-agent-sdk';
import { parseStreamEvent } from '@hhopkins/agent-converters/claude-sdk';
import type { StreamEvent, UserMessageBlock } from '@ai-systems/shared-types';
import { findClaudeExecutable } from '../clients/claude.js';
import { emptyAsyncIterable } from '../clients/channel.js';
import { createLogEvent, createErrorEvent, errorEventFromError } from '../helpers/create-stream-events.js';
import type { ExecuteQueryArgs } from '../types.js';

/**
 * Check if a Claude SDK session transcript exists.
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

/**
 * Execute a query using the Claude SDK.
 *
 * @param input - Query parameters
 * @param messages - Optional async iterable of follow-up messages
 * @yields StreamEvent objects converted from Claude SDK messages
 */
export async function* executeClaudeQuery(
  input: ExecuteQueryArgs,
  _messages: AsyncIterable<UserMessageBlock> = emptyAsyncIterable()
): AsyncGenerator<StreamEvent> {
  yield createLogEvent('Starting Claude SDK query execution', 'info', {
    sessionId: input.sessionId,
    cwd: input.cwd,
  });

  // Validate environment
  if (!process.env.ANTHROPIC_API_KEY) {
    yield createErrorEvent('ANTHROPIC_API_KEY environment variable not set', 'ENV_MISSING');
    throw new Error('ANTHROPIC_API_KEY environment variable not set');
  }

  // Find Claude Code executable
  yield createLogEvent('Finding Claude Code executable', 'debug');
  let claudeCodePath: string;
  try {
    claudeCodePath = await findClaudeExecutable();
    yield createLogEvent('Found Claude Code executable', 'debug', { path: claudeCodePath });
  } catch (error) {
    yield errorEventFromError(error, 'EXECUTABLE_NOT_FOUND');
    throw error;
  }

  const options: Options = {
    pathToClaudeCodeExecutable: claudeCodePath,
    cwd: input.cwd || '/workspace',
    settingSources: ['project', 'user'],
    includePartialMessages: true,
    maxBudgetUsd: 5.0,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    allowedTools: input.tools
      ? [...input.tools, 'Skill']
      : ['Skill'],
    mcpServers: input.mcpServers as Options['mcpServers'],
  };

  const needsCreation = !claudeSessionExists(input.sessionId);
  yield createLogEvent(
    needsCreation ? 'Creating new session' : 'Resuming existing session',
    'info',
    { sessionId: input.sessionId }
  );

  const generator = query({
    prompt: input.prompt,
    options: needsCreation
      ? { ...options, extraArgs: { 'session-id': input.sessionId } }
      : { ...options, resume: input.sessionId },
  });

  try {
    for await (const sdkMessage of generator) {
      // Convert SDK message to StreamEvents using converter
      const streamEvents = parseStreamEvent(sdkMessage);
      for (const event of streamEvents) {
        yield event;
      }
    }
    yield createLogEvent('Claude SDK query completed', 'info', { sessionId: input.sessionId });
  } catch (error) {
    yield errorEventFromError(error, 'QUERY_EXECUTION_ERROR');
    throw error;
  }

  // Note: streaming input mode with messages will be implemented
  // when the Claude SDK fully supports it. For now, we use single-prompt mode.
}
