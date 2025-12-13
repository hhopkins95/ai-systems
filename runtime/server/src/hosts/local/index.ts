/**
 * Local Host - In-memory session hosting with Socket.IO transport
 *
 * This is the default host for single-server deployments.
 * Sessions are stored in-memory and clients connect via Socket.IO.
 *
 * @example
 * ```typescript
 * import { createLocalHost } from '@hhopkins/agent-server';
 *
 * const host = createLocalHost({
 *   persistence: myPersistenceAdapter,
 *   executionEnvironment: config.executionEnvironment,
 * });
 *
 * // Later, attach transport to HTTP server
 * host.attachTransport(httpServer);
 * ```
 */

import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import type { PersistenceAdapter } from '../../types/persistence-adapter.js';
import type { RuntimeConfig } from '../../types/runtime.js';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from '../../types/events.js';
import { logger } from '../../config/logger.js';
import { LocalSessionHost } from './local-session-host.js';
import { SocketIOClientHub } from './socket-io-client-hub.js';
import { setupSessionLifecycleHandlers } from './connection-handlers.js';

/**
 * Configuration for createLocalHost
 */
export interface LocalHostConfig {
  persistence: PersistenceAdapter;
  executionEnvironment: RuntimeConfig['executionEnvironment'];
}

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
 * Return type for createLocalHost
 */
export interface LocalHost {
  /** The session host instance */
  sessionHost: LocalSessionHost;

  /**
   * Attach Socket.IO transport to an HTTP server.
   * Must be called before clients can connect.
   *
   * @param httpServer - HTTP server instance
   * @param options - Optional Socket.IO configuration
   * @returns Socket.IO server instance
   */
  attachTransport(
    httpServer: HTTPServer,
    options?: TransportOptions
  ): SocketIOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
}

/**
 * Create a local session host with Socket.IO transport
 *
 * @param config - Host configuration
 * @returns Local host instance with attachTransport method
 */
export function createLocalHost(config: LocalHostConfig): LocalHost {
  const sessionHost = new LocalSessionHost(
    config.executionEnvironment,
    config.persistence,
  );

  logger.info('LocalSessionHost created');

  return {
    sessionHost,

    attachTransport(httpServer: HTTPServer, options?: TransportOptions) {
      // Create Socket.IO server
      const io = new SocketIOServer<
        ClientToServerEvents,
        ServerToClientEvents,
        InterServerEvents,
        SocketData
      >(httpServer, {
        cors: options?.cors ?? {
          origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'],
          credentials: true,
        },
        path: options?.path ?? '/socket.io',
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
    },
  };
}

// Re-export types that callers might need
export { LocalSessionHost } from './local-session-host.js';
