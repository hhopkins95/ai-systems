/**
 * WebSocket Server - Socket.io setup with Session Event Architecture
 *
 * Provides real-time event streaming between server and clients via WebSocket.
 * Mutations are handled via REST API, WebSocket is for subscription and streaming only.
 *
 * Architecture (New):
 * - Session-scoped events: AgentSession → SessionEventBus → ClientBroadcastListener → SocketIOClientHub → Socket.io rooms
 * - Global events: SessionManager → GlobalEventBus → Socket.io broadcast
 * - handlers/ handle session room join/leave operations
 */

import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import type { SessionManager } from '../../core/session-manager.js';
import type { EventBus } from '../../core/event-bus.js';
import { logger } from '../../config/logger.js';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from '../../types/events.js';
import { setupGlobalEventListeners } from './event-listeners.js';
import { setupSessionLifecycleHandlers } from './handlers/session-lifecycle.js';
import { SocketIOClientHub } from './socket-io-client-hub.js';

/**
 * Create and configure WebSocket server with Session Event Architecture
 *
 * @param httpServer - HTTP server instance to attach Socket.io to
 * @param sessionManager - SessionManager instance
 * @param eventBus - GlobalEventBus instance for global events only
 * @returns Configured Socket.io server and ClientHub
 */
export function createWebSocketServer(
  httpServer: HTTPServer,
  sessionManager: SessionManager,
  eventBus: EventBus
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
  // Create SocketIOClientHub and inject into SessionManager
  // ==========================================================================

  const clientHub = new SocketIOClientHub(io);
  sessionManager.setClientHub(clientHub);
  logger.info('SocketIOClientHub created and injected into SessionManager');

  // ==========================================================================
  // Setup Global Event Listeners (GlobalEventBus → Socket.io broadcast)
  // Session-scoped events are now handled by ClientBroadcastListener
  // ==========================================================================

  setupGlobalEventListeners(io, sessionManager, eventBus);

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
    setupSessionLifecycleHandlers(socket, sessionManager);

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
