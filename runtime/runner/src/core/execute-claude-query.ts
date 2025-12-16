/**
 * Claude SDK query execution.
 *
 * Pure async generator that yields StreamEvents from Claude SDK responses.
 */

import { query, Options } from '@anthropic-ai/claude-agent-sdk';
import { parseStreamEvent } from '@hhopkins/agent-converters/claude-sdk';
import type { StreamEvent, UserMessageBlock } from '@ai-systems/shared-types';
import { ClaudeEntityManager } from '@hhopkins/claude-entity-manager';
import { findClaudeExecutable } from '../clients/claude.js';
import { emptyAsyncIterable } from '../clients/channel.js';
import { createLogEvent, createErrorEvent, errorEventFromError } from '../helpers/create-stream-events.js';
import type { ExecuteQueryArgs } from '../types.js';
import { getWorkspacePaths } from '../helpers/get-workspace-paths.js';
import path from 'path';
import fs from 'fs';

/**
 * Check if a Claude SDK session transcript exists.
 * Uses ClaudeEntityManager for unified session management.
 */
async function claudeSessionExists(sessionId: string): Promise<boolean> {
  const manager = new ClaudeEntityManager();
  return manager.sessionExists(sessionId);
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

  const paths = getWorkspacePaths({baseWorkspacePath: input.baseWorkspacePath});

  // make sure the workspace directory exists
  if (!fs.existsSync(paths.workspaceDir)) {
    fs.mkdirSync(paths.workspaceDir, { recursive: true });
  }

  yield createLogEvent('Starting Claude SDK query execution', 'info', {
    sessionId: input.sessionId,
    baseWorkspacePath: input.baseWorkspacePath,
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
    cwd: paths.workspaceDir,
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

  const needsCreation = !(await claudeSessionExists(input.sessionId));
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
