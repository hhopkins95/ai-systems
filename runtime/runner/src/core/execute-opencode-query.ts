/**
 * OpenCode SDK query execution.
 *
 * Pure async generator that yields StreamEvents from OpenCode responses.
 */

import * as fs from 'fs';
import * as path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createStreamEventParser } from '@hhopkins/agent-converters/opencode';
import type { StreamEvent, UserMessageBlock } from '@ai-systems/shared-types';
import { getOpencodeConnection } from '../clients/opencode.js';
import { emptyAsyncIterable } from '../clients/channel.js';
import { createLogEvent, createErrorEvent, errorEventFromError } from '../helpers/create-stream-events.js';
import type { ExecuteQueryArgs } from '../types.js';
import { getWorkspacePaths } from '../helpers/get-workspace-paths.js';
import { setEnvironment } from '../helpers/set-environment.js';
import { createOpencodeClient } from '@opencode-ai/sdk';

const execAsync = promisify(exec);

/**
 * Create an OpenCode session with a specific ID.
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

  if (!fs.existsSync(filePath)) {
    throw new Error(`File was not created at ${filePath}`);
  }

  try {
    await execAsync(`opencode import "${filePath}"`);
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Execute a query using the OpenCode SDK.
 *
 * @param input - Query parameters
 * @param messages - Optional async iterable of follow-up messages
 * @yields StreamEvent objects converted from OpenCode events
 */
export async function* executeOpencodeQuery(
  input: ExecuteQueryArgs,
  _messages: AsyncIterable<UserMessageBlock> = emptyAsyncIterable()
): AsyncGenerator<StreamEvent> {
  yield createLogEvent('Starting OpenCode SDK query execution', 'info', {
    sessionId: input.sessionId,
    baseWorkspacePath: input.baseWorkspacePath,
    model: input.model,
  });

  if (!input.model) {
    yield createErrorEvent('Model is required for opencode architecture (format: provider/model)', 'INVALID_INPUT');
    throw new Error('Model is required for opencode architecture (format: provider/model)');
  }

  const [providerID, modelID] = input.model.split('/');
  if (!providerID || !modelID) {
    yield createErrorEvent('Model must be in format provider/model', 'INVALID_INPUT');
    throw new Error('Model must be in format provider/model (e.g., anthropic/claude-sonnet-4-20250514)');
  }

  yield createLogEvent('Connecting to OpenCode server', 'debug');
  let connection;
  try {
    connection = await getOpencodeConnection();
    yield createLogEvent('Connected to OpenCode server', 'debug');
  } catch (error) {
    yield errorEventFromError(error, 'CONNECTION_ERROR');
    throw error;
  }
  const client = connection.client;

  const paths = getWorkspacePaths({baseWorkspacePath: input.baseWorkspacePath});
  setEnvironment({baseWorkspacePath: input.baseWorkspacePath});

  try {
    // Create stateful parser for this session
    const parser = createStreamEventParser(input.sessionId);

    // Check if session exists, create if not
    const existingSession = await client.session.get({
      path: { id: input.sessionId },
      query: { directory: paths.workspaceDir },
    });

    if (!existingSession.data) {
      yield createLogEvent('Creating new OpenCode session', 'info', { sessionId: input.sessionId, cwd: paths.workspaceDir });
      await createOpencodeSession(input.sessionId, paths.workspaceDir);
    } else {
      yield createLogEvent('Resuming existing OpenCode session', 'info', { sessionId: input.sessionId });
    }

    // Create a promise that will resolve when we get the idle event
    let resolveEventStream: () => void;
    const eventStreamComplete = new Promise<void>(resolve => {
      resolveEventStream = resolve;
    });

    // Collect events
    const events: StreamEvent[] = [];

    // Start event subscription in parallel (IMPORTANT: must start before prompt)
    const eventPromise = (async () => {
      const eventResult = await client.event.subscribe({
        query: { directory: paths.workspaceDir },
      });

      for await (const event of eventResult.stream) {
        // Convert OpenCode event to StreamEvents using stateful parser
        const streamEvents = parser.parseEvent(event);
        events.push(...streamEvents);

        // Break when session goes idle
        if (event.type === 'session.idle' && event.properties.sessionID === input.sessionId) {
          resolveEventStream!();
          break;
        }
      }
    })();

    // Authenticate
    yield createLogEvent('Authenticating with OpenCode', 'debug');
    await client.auth.set({
      path: { id: 'zen' },
      body: { type: 'api', key: process.env.OPENCODE_API_KEY || '' },
      query: { directory: paths.workspaceDir },
    });

    // Send prompt
    yield createLogEvent('Sending prompt to OpenCode', 'debug');

    await client.session.prompt({
      path: { id: input.sessionId },
      query: { directory: paths.workspaceDir },

      body: {
        model: { providerID, modelID },
        parts: [{ type: 'text', text: input.prompt }],
      },
    });

    // Wait for event stream to complete
    await eventStreamComplete;

    // Yield all collected events
    for (const event of events) {
      yield event;
    }

    // Also wait for the event promise to finish
    await eventPromise;

    yield createLogEvent('OpenCode SDK query completed', 'info', { sessionId: input.sessionId });
  } catch (error) {
    yield errorEventFromError(error, 'QUERY_EXECUTION_ERROR');
    throw error;
  }
  // Note: We don't close the server here anymore to allow sharing
  // between multiple local sessions. The server will be cleaned up
  // when the process exits.

  // Note: streaming input mode with messages will be implemented
  // when needed. For now, we use single-prompt mode.
}
