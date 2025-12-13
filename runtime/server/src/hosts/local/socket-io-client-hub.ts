/**
 * Socket.IO Client Hub - WebSocket-based ClientHub implementation
 *
 * Uses Socket.IO rooms for session-scoped broadcasting.
 * Clients join room `session:${sessionId}` to receive events.
 *
 * This is the production implementation of ClientHub for web clients.
 */

import type { Server as SocketIOServer } from 'socket.io';
import type { ClientHub, ClientHubEvents } from '../../core/session/client-hub.js';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from '../../types/events.js';
import { logger } from '../../config/logger.js';

// Type alias for the fully-typed Socket.IO server
type TypedSocketIOServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

// ============================================================================
// SocketIOClientHub Class
// ============================================================================

/**
 * Socket.IO implementation of ClientHub
 *
 * Broadcasts events to clients in session-specific rooms.
 */
export class SocketIOClientHub implements ClientHub {
  private readonly io: TypedSocketIOServer;

  constructor(io: TypedSocketIOServer) {
    this.io = io;
  }

  /**
   * Broadcast an event to all clients subscribed to a session
   */
  broadcast<K extends keyof ClientHubEvents>(
    sessionId: string,
    event: K,
    data: ClientHubEvents[K]
  ): void {
    const roomName = `session:${sessionId}`;

    logger.debug(
      {
        sessionId,
        event,
        room: roomName,
      },
      'Broadcasting to session room'
    );

    // Map ClientHubEvents to ServerToClientEvents
    // The event names align directly, so we can cast
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.io.to(roomName).emit(event as keyof ServerToClientEvents, data as any);
  }

  /**
   * Get count of connected clients for a session
   */
  getClientCount(sessionId: string): number {
    const roomName = `session:${sessionId}`;
    const room = this.io.sockets.adapter.rooms.get(roomName);
    return room?.size ?? 0;
  }

  /**
   * Get the underlying Socket.IO server
   * Useful for advanced operations not covered by ClientHub interface
   */
  getIO(): TypedSocketIOServer {
    return this.io;
  }
}
