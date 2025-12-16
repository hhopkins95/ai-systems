/**
 * OpenCode SDK query execution.
 *
 * Pure async generator that yields StreamEvents from OpenCode responses.
 */

import { createStreamEventParser } from '@hhopkins/agent-converters/opencode';
import type { StreamEvent, UserMessageBlock } from '@ai-systems/shared-types';
import { getOpencodeConnection } from '../clients/opencode.js';
import { emptyAsyncIterable, createMessageChannel } from '../clients/channel.js';
import { createLogEvent, createErrorEvent, errorEventFromError } from '../helpers/create-stream-events.js';
import type { ExecuteQueryArgs } from '../types.js';
import { getWorkspacePaths } from '../helpers/get-workspace-paths.js';
import { setEnvironment } from '../helpers/set-environment.js';

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
  

  const paths = getWorkspacePaths({baseWorkspacePath: input.baseWorkspacePath});
  setEnvironment({baseWorkspacePath: input.baseWorkspacePath});

  const client = connection.client;

  try {
    // Determine actual session ID - either existing or newly created
    let actualSessionId = input.sessionId;

    // Check if session exists
    const existingSession = await client.session.get({
      sessionID: input.sessionId,
      directory: paths.workspaceDir,
    });

    if (!existingSession.data) {
      // Create session via SDK (server-generated ID)
      yield createLogEvent('Creating new OpenCode session via SDK', 'info', { requestedId: input.sessionId, cwd: paths.workspaceDir });
      const createResult = await client.session.create({
        directory: paths.workspaceDir,
      });
      if (!createResult.data?.id) {
        throw new Error('Failed to create session - no ID returned');
      }
      actualSessionId = createResult.data.id;
      yield createLogEvent('Session created', 'info', { actualSessionId });
    } else {
      yield createLogEvent('Resuming existing OpenCode session', 'info', { sessionId: actualSessionId });
    }

    // Create stateful parser for this session
    const parser = createStreamEventParser(actualSessionId);

    // Create channel for real-time event streaming
    const eventChannel = createMessageChannel<StreamEvent>();

    // Start event subscription in parallel (IMPORTANT: must start before prompt)
    // Events are pushed to channel and yielded in real-time below
    // NOTE: directory must match session.prompt to receive events from same Bus
    const eventPromise = (async () => {
      const eventResult = await client.event.subscribe({ directory: paths.workspaceDir });

      // Track if we've seen any activity for our session
      // We only close on idle AFTER seeing activity to avoid closing on stale idle state
      let sawActivity = false;

      for await (const event of eventResult.stream) {
        console.log("Received event:", event.type);
        // Debug: log raw event type and session
        const eventSessionId = (event as any).properties?.sessionID
          || (event as any).properties?.part?.sessionID
          || (event as any).properties?.info?.sessionID;
        const isOurSession = eventSessionId === actualSessionId;

        // Track activity for our session (non-idle events)
        if (isOurSession && event.type !== 'session.idle') {
          sawActivity = true;
        }

        // Convert OpenCode event to StreamEvents using stateful parser
        const streamEvents = parser.parseEvent(event);
        for (const streamEvent of streamEvents) {
          eventChannel.send(streamEvent);
        }

        // Close channel when session goes idle AFTER we've seen activity
        if (event.type === 'session.idle' && isOurSession && sawActivity) {
          eventChannel.close();
          break;
        }
      }
    })();

    // Send prompt
    yield createLogEvent('Sending prompt to OpenCode', 'debug', { sessionId: actualSessionId });

    await client.session.prompt({
      sessionID: actualSessionId,
      directory: paths.workspaceDir,
      model: { providerID: "opencode", modelID: "big-pickle" },
      parts: [{ type: 'text', text: input.prompt }],
    });

    // Yield events in real-time as they arrive from the channel
    for await (const event of eventChannel.receive()) {
      yield event;
    }

    // Wait for event subscription to fully complete
    await eventPromise;

    yield createLogEvent('OpenCode SDK query completed', 'info', { sessionId: actualSessionId });
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
