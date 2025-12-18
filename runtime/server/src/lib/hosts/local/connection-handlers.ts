/**
 * Connection Handlers
 *
 * WebSocket handlers for joining and leaving session rooms
 */

import type { Socket } from 'socket.io';
import type { LocalSessionHost } from './local-session-host.js';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from '../../../types/events.js';
import { createSessionEvent } from '@ai-systems/shared-types';
import { logger } from '../../../config/logger.js';

/**
 * Extract error message from unknown error object
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Internal server error';
}

/**
 * Properly typed Socket with custom event interfaces
 */
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

/**
 * Setup session lifecycle event handlers on a socket
 */
export function setupSessionLifecycleHandlers(
  socket: TypedSocket,
  sessionHost: LocalSessionHost
): void {
  /**
   * Join session room to receive updates
   */
  socket.on('session:join', async (sessionId, callback) => {
    try {
      logger.debug({ socketId: socket.id, sessionId }, 'Client joining session room');

      // First check if session is already loaded in memory
      let session = sessionHost.getSession(sessionId);

      // If not loaded, try to load from persistence
      if (!session) {
        try {
          session = await sessionHost.loadSession(sessionId);
        } catch {
          // Session doesn't exist in persistence either
          logger.warn({ socketId: socket.id, sessionId }, 'Session not found');
          callback({ success: false, error: 'Session not found' });
          return;
        }
      }

      // Join Socket.io room
      socket.join(`session:${sessionId}`);
      socket.data.sessionId = sessionId;

      // Send current status immediately so client has correct state
      const state = session.getState();
      socket.emit('session:event', createSessionEvent('status', {
        runtime: state.runtime,
      }, {
        sessionId,
        source: 'server',
      }));

      logger.debug(
        {
          socketId: socket.id,
          sessionId,
          isLoaded: state.runtime.isLoaded,
          eeStatus: state.runtime.executionEnvironment?.status ?? 'none',
        },
        'Client joined session room'
      );

      callback({ success: true });
    } catch (error) {
      logger.error({ error, socketId: socket.id, sessionId }, 'Failed to join session');
      callback({
        success: false,
        error: getErrorMessage(error),
      });
    }
  });

  /**
   * Leave session room
   */
  socket.on('session:leave', (sessionId, callback) => {
    try {
      logger.debug({ socketId: socket.id, sessionId }, 'Client leaving session room');

      socket.leave(`session:${sessionId}`);
      socket.data.sessionId = undefined;

      logger.debug(
        {
          socketId: socket.id,
          sessionId,
        },
        'Client left session room'
      );

      callback({ success: true });
    } catch (error) {
      logger.error({ error, socketId: socket.id, sessionId }, 'Failed to leave session');
      callback({ success: true }); // Always return success for leave
    }
  });
}
