/**
 * Claude SDK query execution.
 *
 * Pure async generator that yields SessionEvents from Claude SDK responses.
 */

import { query, Options, HookCallback, PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';
import { parseStreamEvent } from '@hhopkins/agent-converters/claude-sdk';
import type { AnySessionEvent, UserMessageBlock, McpServerConfig } from '@ai-systems/shared-types';
import { ClaudeEntityManager } from '@hhopkins/claude-entity-manager';
import { findClaudeExecutable } from '../clients/claude.js';
import { emptyAsyncIterable } from '../clients/channel.js';
import {
  createLogSessionEvent,
  createErrorSessionEvent,
  errorSessionEventFromError,
} from '../helpers/create-stream-events.js';
import type { ExecuteQueryArgs } from '../types.js';
import { getWorkspacePaths } from '../helpers/get-workspace-paths.js';
import fs from 'fs';
import path from 'path';

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
 * @yields SessionEvent objects converted from Claude SDK messages
 */
export async function* executeClaudeQuery(
  input: ExecuteQueryArgs,
  _messages: AsyncIterable<UserMessageBlock> = emptyAsyncIterable()
): AsyncGenerator<AnySessionEvent> {

  const paths = getWorkspacePaths({baseWorkspacePath: input.baseWorkspacePath});

  // make sure the workspace directory exists
  if (!fs.existsSync(paths.workspaceDir)) {
    fs.mkdirSync(paths.workspaceDir, { recursive: true });
  }

  yield createLogSessionEvent('Starting Claude SDK query execution', 'info', {
    sessionId: input.sessionId,
    baseWorkspacePath: input.baseWorkspacePath,
  });

  // Validate environment
  if (!process.env.ANTHROPIC_API_KEY) {
    yield createErrorSessionEvent('ANTHROPIC_API_KEY environment variable not set', 'ENV_MISSING');
    throw new Error('ANTHROPIC_API_KEY environment variable not set');
  }

  // Find Claude Code executable
  yield createLogSessionEvent('Finding Claude Code executable', 'debug');
  let claudeCodePath: string;
  try {
    claudeCodePath = await findClaudeExecutable();
    yield createLogSessionEvent('Found Claude Code executable', 'debug', { path: claudeCodePath });
  } catch (error) {
    yield errorSessionEventFromError(error, 'EXECUTABLE_NOT_FOUND');
    throw error;
  }

  // Load MCP servers from the .mcp.json that loadAgentProfile wrote
  yield createLogSessionEvent('Loading MCP servers from config', 'debug');
  const claudeEntityManager = new ClaudeEntityManager({
    projectDir: paths.workspaceDir,
    claudeDir: paths.claudeConfigDir,
  });
  const mcpServersArray = await claudeEntityManager.loadMcpServers();

  // Convert array to Record<string, McpServerConfig> for SDK
  const mcpServers: Record<string, McpServerConfig> = {};
  for (const server of mcpServersArray) {
    const { name, source, ...config } = server;
    mcpServers[name] = config as McpServerConfig;
  }
  yield createLogSessionEvent('Loaded MCP servers', 'debug', {
    count: mcpServersArray.length,
    names: Object.keys(mcpServers),
    tools: input.tools,
  });

  const allowedTools = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Skill', 'Task', 'WebFetch'];

  // Hook to block file access outside workspace directory
  const blockParentDirectoryAccess: HookCallback = async (hookInput) => {
    if (hookInput.hook_event_name !== 'PreToolUse') return {};

    const preInput = hookInput as PreToolUseHookInput;
    const toolInput = preInput.tool_input as Record<string, unknown> | undefined;

    // Extract file path from input (different tools use different field names)
    const filePath = (toolInput?.file_path || toolInput?.notebook_path || toolInput?.path) as string | undefined;

    if (filePath) {
      const absolutePath = path.resolve(paths.workspaceDir, filePath);
      const workspaceAbsolute = path.resolve(paths.workspaceDir);

      if (!absolutePath.startsWith(workspaceAbsolute)) {
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: `Access outside workspace directory is not allowed: ${filePath}`,
          },
        };
      }
    }

    return {};
  };

  // Hook to auto-approve all MCP server tools
  const autoApproveMcpTools: HookCallback = async (hookInput) => {
    if (hookInput.hook_event_name !== 'PreToolUse') return {};

    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: 'MCP tool auto-approved',
      },
    };
  };

  const options: Options = {
    pathToClaudeCodeExecutable: claudeCodePath,
    cwd: paths.workspaceDir,
    settingSources: ['project', 'user'],
    includePartialMessages: true,
    maxBudgetUsd: 5.0,
    permissionMode: 'acceptEdits',
    allowedTools: allowedTools,
    mcpServers: mcpServers as Options['mcpServers'],
    hooks: {
      PreToolUse: [
        // Restrict file access to workspace directory only
        {
          matcher: 'Read|Write|Edit|Glob|Grep|NotebookEdit',
          hooks: [blockParentDirectoryAccess],
        },
        // Auto-approve all MCP server tools
        {
          matcher: '^mcp__',
          hooks: [autoApproveMcpTools],
        },
      ],
    },
  };

  const needsCreation = !(await claudeSessionExists(input.sessionId));
  yield createLogSessionEvent(
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
      // Convert SDK message to SessionEvents using converter
      const sessionEvents = parseStreamEvent(sdkMessage);
      for (const sessionEvent of sessionEvents) {
        yield sessionEvent;
      }
    }
    yield createLogSessionEvent('Claude SDK query completed', 'info', { sessionId: input.sessionId });
  } catch (error) {
    yield errorSessionEventFromError(error, 'QUERY_EXECUTION_ERROR');
    throw error;
  }

  // Note: streaming input mode with messages will be implemented
  // when the Claude SDK fully supports it. For now, we use single-prompt mode.
}
