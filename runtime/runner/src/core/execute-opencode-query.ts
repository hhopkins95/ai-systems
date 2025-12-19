/**
 * OpenCode SDK query execution.
 *
 * Pure async generator that yields SessionEvents from OpenCode responses.
 */

import * as fs from 'fs';
import * as path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createStreamEventParser } from '@hhopkins/agent-converters/opencode';
import type { AnySessionEvent, UserMessageBlock } from '@ai-systems/shared-types';
import { createIsolatedServer } from '../clients/opencode.js';
import { emptyAsyncIterable, createMessageChannel } from '../clients/channel.js';
import {
  createLogSessionEvent,
  createErrorSessionEvent,
  errorSessionEventFromError,
} from '../helpers/create-stream-events.js';
import type { ExecuteQueryArgs } from '../types.js';
import { getWorkspacePaths } from '../helpers/get-workspace-paths.js';

const execAsync = promisify(exec);

/**
 * Create an OpenCode session with a specific ID.
 * Uses CLI import to preserve custom session IDs.
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
    // Run CLI import in the workspace directory so session is stored in correct project
    await execAsync(`opencode import "${filePath}"`, { cwd });
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
 * @yields SessionEvent objects converted from OpenCode events
 */
export async function* executeOpencodeQuery(
  input: ExecuteQueryArgs,
  _messages: AsyncIterable<UserMessageBlock> = emptyAsyncIterable()
): AsyncGenerator<AnySessionEvent> {
  yield createLogSessionEvent('Starting OpenCode SDK query execution', 'info', {
    sessionId: input.sessionId,
    baseWorkspacePath: input.baseWorkspacePath,
    model: input.model,
  });

  if (!input.model) {
    yield createErrorSessionEvent('Model is required for opencode architecture (format: provider/model)', 'INVALID_INPUT');
    throw new Error('Model is required for opencode architecture (format: provider/model)');
  }

  // Set up workspace paths
  const paths = getWorkspacePaths({baseWorkspacePath: input.baseWorkspacePath});

  // Create isolated server with specific config for this workspace
  yield createLogSessionEvent('Creating isolated OpenCode server', 'debug');
  let connection;
  try {
    connection = await createIsolatedServer({
      configPath: paths.opencodeConfigFile,
    });
    yield createLogSessionEvent('Isolated OpenCode server started', 'debug');
  } catch (error) {
    yield errorSessionEventFromError(error, 'CONNECTION_ERROR');
    throw error;
  }

  const client = connection.client;

  try {
    // Check if session exists, create if not
    const existingSession = await client.session.get({
      sessionID: input.sessionId,
      directory: paths.workspaceDir,
    });

    if (!existingSession.data) {
      yield createLogSessionEvent('Creating new OpenCode session', 'info', { sessionId: input.sessionId, cwd: paths.workspaceDir });
      await createOpencodeSession(input.sessionId, paths.workspaceDir);
    } else {
      yield createLogSessionEvent('Resuming existing OpenCode session', 'info', { sessionId: input.sessionId });
    }

    // Create stateful parser for this session (still uses old StreamEvent format)
    const parser = createStreamEventParser(input.sessionId);

    // Create channel for real-time event streaming
    const eventChannel = createMessageChannel<AnySessionEvent>();

    // Establish event subscription BEFORE sending prompt (critical for streaming)
    // NOTE: directory must match session.prompt to receive events from same Bus
    yield createLogSessionEvent('Establishing event subscription', 'debug');
    const eventResult = await client.event.subscribe({ directory: paths.workspaceDir });

    // Process events in background (subscription is now established)
    const eventPromise = (async () => {
      // Track if we've seen any activity for our session
      // We only close on idle AFTER seeing activity to avoid closing on stale idle state
      let sawActivity = false;

      for await (const event of eventResult.stream) {
        eventChannel.send({type : "log", payload : { 
          message : "RAW SDK MESSAGE",
          data : event,
        }, context : {
          timestamp : new Date().toISOString(),
          sessionId : input.sessionId,
          source : "runner",
        }});

        // Extract session ID from event
        const eventSessionId = (event as any).properties?.sessionID
          || (event as any).properties?.part?.sessionID
          || (event as any).properties?.info?.sessionID;
        const isOurSession = eventSessionId === input.sessionId;

        // Track activity for our session (non-idle events)
        if (isOurSession && event.type !== 'session.idle') {
          sawActivity = true;
        }

        // Convert OpenCode event to SessionEvents using stateful parser
        const sessionEvents = parser.parseEvent(event);
        for (const sessionEvent of sessionEvents) {
          eventChannel.send(sessionEvent);
        }

        // Close channel when session goes idle AFTER we've seen activity
        if (event.type === 'session.idle' && isOurSession && sawActivity) {
          eventChannel.close();
          break;
        }
      }
    })();

    // Send prompt (don't await - let it run while we yield events)
    yield createLogSessionEvent('Sending prompt to OpenCode', 'debug', { sessionId: input.sessionId });

    const promptPromise = client.session.prompt({
      sessionID: input.sessionId,
      directory: paths.workspaceDir,
      model: { providerID: "opencode", modelID: "big-pickle" },
      parts: [{ type: 'text', text: input.prompt }],
    });

    // Yield events in real-time as they arrive from the channel
    for await (const event of eventChannel.receive()) {
      yield event;
    }

    // Wait for prompt and event subscription to fully complete
    await promptPromise;
    await eventPromise;

    yield createLogSessionEvent('OpenCode SDK query completed', 'info', { sessionId: input.sessionId });
  } catch (error) {
    yield errorSessionEventFromError(error, 'QUERY_EXECUTION_ERROR');
    throw error;
  } finally {
    // Always close the isolated server when done
    yield createLogSessionEvent('Closing isolated OpenCode server', 'debug');
    connection.close();
  }
}
