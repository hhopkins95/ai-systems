/**
 * Local Host - In-memory session hosting with Socket.IO transport
 *
 * This is the default host for single-server deployments.
 * Sessions are stored in-memory and clients connect via Socket.IO.
 *
 * @example
 * ```typescript
 * import { createAgentRuntime } from '@hhopkins/agent-server';
 *
 * const runtime = await createAgentRuntime({
 *   persistence: myPersistenceAdapter,
 *   executionEnvironment: { type: 'modal', modal: {...} },
 *   host: { type: 'local' }
 * });
 *
 * // Later, attach transport to HTTP server
 * runtime.attachTransport(httpServer);
 * ```
 */

import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import type { LocalHostConfig } from '../../../types/host-config.js';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from '../../../types/events.js';
import { logger } from '../../../config/logger.js';
import { LocalSessionHost } from './local-session-host.js';
import { SocketIOClientHub } from './socket-io-client-hub.js';
import { setupSessionLifecycleHandlers } from './connection-handlers.js';

/**
 * Socket.IO server configuration options
 */
export interface TransportOptions {
  cors?: {
    origin: string | string[];
    credentials?: boolean;
  };
  path?: string;
}

/**
 * Socket.IO server type alias for convenience
 */
export type SocketIOServerInstance = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

// ============================================================================
// Transport Setup (used by runtime.ts)
// ============================================================================

/**
 * Attach Socket.IO transport to a LocalSessionHost
 *
 * This is the internal function used by createAgentRuntime for local hosts.
 *
 * @param sessionHost - The LocalSessionHost instance
 * @param httpServer - HTTP server instance
 * @param hostConfig - Local host configuration (cors, socketPath, etc.)
 * @returns Socket.IO server instance
 */
export function attachLocalTransport(
  sessionHost: LocalSessionHost,
  httpServer: HTTPServer,
  hostConfig?: LocalHostConfig
): SocketIOServerInstance {
  // Create Socket.IO server
  const io = new SocketIOServer<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: hostConfig?.cors ?? {
      origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'],
      credentials: true,
    },
    path: hostConfig?.socketPath ?? '/socket.io',
  });

  logger.info('Initializing Socket.IO transport for LocalSessionHost...');

  // Create ClientHub and inject into SessionHost
  const clientHub = new SocketIOClientHub(io);
  sessionHost.setClientHub(clientHub);
  logger.info('SocketIOClientHub created and injected into LocalSessionHost');

  // Setup connection handlers
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

      if (socket.data.sessionId) {
        logger.debug(
          { sessionId: socket.data.sessionId },
          'Client disconnected from session'
        );
      }
    });
  });

  logger.info('Socket.IO transport initialized successfully');

  return io;
}

// Re-export classes that callers might need
export { LocalSessionHost } from './local-session-host.js';
