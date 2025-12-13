/**
 * WebSocket Server - Socket.io setup with Session Event Architecture
 *
 * Provides real-time event streaming between server and clients via WebSocket.
 * Mutations are handled via REST API, WebSocket is for subscription and streaming only.
 *
 * Architecture:
 * - Session-scoped events: AgentSession → SessionEventBus → ClientBroadcastListener → SocketIOClientHub → Socket.io rooms
 * - Session list is REST-only (no WebSocket broadcast)
 * - handlers/ handle session room join/leave operations
 */

import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import type { LocalSessionHost } from '../../core/session/local-session-host.js';
import { logger } from '../../config/logger.js';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from '../../types/events.js';
import { setupSessionLifecycleHandlers } from './handlers/session-lifecycle.js';
import { SocketIOClientHub } from './socket-io-client-hub.js';

/**
 * Create and configure WebSocket server with Session Event Architecture
 *
 * @param httpServer - HTTP server instance to attach Socket.io to
 * @param sessionHost - SessionHost instance for session lifecycle
 * @returns Configured Socket.io server and ClientHub
 */
export function createWebSocketServer(
  httpServer: HTTPServer,
  sessionHost: LocalSessionHost
): {
  io: SocketIOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
  clientHub: SocketIOClientHub;
} {
  // Create Socket.io server
  const io = new SocketIOServer<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: {
      origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'],
      credentials: true,
    },
    path: '/socket.io',
  });

  logger.info('Initializing WebSocket server (Session Event Architecture)...');

  // ==========================================================================
  // Create SocketIOClientHub and inject into SessionHost
  // ==========================================================================

  const clientHub = new SocketIOClientHub(io);
  sessionHost.setClientHub(clientHub);
  logger.info('SocketIOClientHub created and injected into SessionHost');

  // ==========================================================================
  // Connection Handler (Socket.io → Business Logic)
  // ==========================================================================

  io.on('connection', (socket) => {
    logger.info(
      {
        socketId: socket.id,
        transport: socket.conn.transport.name,
      },
      'Client connected to WebSocket'
    );

    // Store connection metadata
    socket.data.joinedAt = Date.now();

    // Setup socket event handlers
    setupSessionLifecycleHandlers(socket, sessionHost);

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      logger.info(
        {
          socketId: socket.id,
          sessionId: socket.data.sessionId,
          reason,
        },
        'Client disconnected from WebSocket'
      );

      // Cleanup handled by Socket.io (socket leaves all rooms automatically)
      if (socket.data.sessionId) {
        logger.debug(
          {
            sessionId: socket.data.sessionId,
          },
          'Client disconnected from session'
        );
      }
    });
  });

  logger.info('WebSocket server initialized successfully (Session Event Architecture)');

  return { io, clientHub };
}
