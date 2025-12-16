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
import { getOpencodeConnection, closeOpencodeServer } from '../clients/opencode.js';
import { emptyAsyncIterable, createMessageChannel } from '../clients/channel.js';
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

  // const [providerID, modelID] = input.model.split('/');
  // if (!providerID || !modelID) {
  //   yield createErrorEvent('Model must be in format provider/model', 'INVALID_INPUT');
  //   throw new Error('Model must be in format provider/model (e.g., anthropic/claude-sonnet-4-20250514)');
  // }

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
    });

    if (!existingSession.data) {
      yield createLogEvent('Creating new OpenCode session', 'info', { sessionId: input.sessionId, cwd: paths.workspaceDir });
      await createOpencodeSession(input.sessionId, paths.workspaceDir);
    } else {
      yield createLogEvent('Resuming existing OpenCode session', 'info', { sessionId: input.sessionId });
    }

    // Create channel for real-time event streaming
    const eventChannel = createMessageChannel<StreamEvent>();

    // Start event subscription in parallel (IMPORTANT: must start before prompt)
    // Events are pushed to channel and yielded in real-time below
    const eventPromise = (async () => {
      const eventResult = await client.event.subscribe();

      // Track if we've seen any activity for our session
      // We only close on idle AFTER seeing activity to avoid closing on stale idle state
      let sawActivity = false;

      for await (const event of eventResult.stream) {
        // Debug: log raw event type and session
        // sessionID location varies by event type:
        // - message.updated: properties.info.sessionID
        // - message.part.updated: properties.part.sessionID
        // - session.*: properties.sessionID
        const eventSessionId = (event as any).properties?.sessionID
          || (event as any).properties?.part?.sessionID
          || (event as any).properties?.info?.sessionID;
        const isOurSession = eventSessionId === input.sessionId;

        console.error(`[DEBUG] Event: ${event.type}, sessionId: ${eventSessionId}, isOurs: ${isOurSession}, sawActivity: ${sawActivity}`);

        // Log full event for message.part.updated to see delta and content
        if (event.type === 'message.part.updated') {
          console.error(`[DEBUG] Full message.part.updated:`, JSON.stringify(event, null, 2));
        }

        // Track activity - any message event for our session means processing started
        if (isOurSession && (
          event.type === 'message.updated' ||
          event.type === 'message.part.updated' ||
          (event.type === 'session.status' && (event as any).properties?.status?.type === 'busy')
        )) {
          sawActivity = true;
          console.error(`[DEBUG] Saw activity!`);
        }

        // Convert OpenCode event to StreamEvents using stateful parser
        const streamEvents = parser.parseEvent(event);
        for (const streamEvent of streamEvents) {
          eventChannel.send(streamEvent);
        }

        // Close channel when session goes idle AFTER we've seen activity
        if (event.type === 'session.idle' && isOurSession && sawActivity) {
          console.error(`[DEBUG] Closing channel - session idle after activity`);
          eventChannel.close();
          break;
        }
      }
    })();

    // Authenticate
    yield createLogEvent('Authenticating with OpenCode', 'debug');
    await client.auth.set({
      path: { id: 'zen' },
      body: { type: 'api', key: process.env.OPENCODE_API_KEY || '' },
    });

    // Send prompt
    yield createLogEvent('Sending prompt to OpenCode', 'debug');

    const promptResult = await client.session.prompt({
      path: { id: input.sessionId },
      body: {
        model: { providerID : "opencode", modelID : "big-pickle" },
        parts: [{ type: 'text', text: input.prompt }],
      },
    });

    console.error('[DEBUG] session.prompt() result:', JSON.stringify(promptResult, null, 2));

    // Yield events in real-time as they arrive from the channel
    for await (const event of eventChannel.receive()) {
      yield event;
    }

    // Wait for event subscription to fully complete
    console.error('[DEBUG] Waiting for eventPromise...');
    await eventPromise;
    console.error('[DEBUG] eventPromise resolved, generator completing');

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
