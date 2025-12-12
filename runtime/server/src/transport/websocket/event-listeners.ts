/**
 * Global Event Bus to WebSocket Bridge
 *
 * Listens to GLOBAL domain events from EventBus and translates them to Socket.io broadcasts.
 *
 * Note: Session-scoped events are now handled by ClientBroadcastListener in the new architecture.
 * This file only handles global events like sessions:changed.
 *
 * Architecture (New):
 * - Session-scoped events: AgentSession → SessionEventBus → ClientBroadcastListener → SocketIOClientHub
 * - Global events: SessionManager → GlobalEventBus → This module → Socket.io broadcast
 */

import type { Server as SocketIOServer } from 'socket.io';
import type { SessionManager } from '../../core/session-manager.js';
import type { EventBus } from '../../core/event-bus.js';
import { logger } from '../../config/logger.js';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from '../../types/events.js';

/**
 * Setup global event listeners to bridge GlobalEventBus → Socket.io
 *
 * Only handles global events (sessions:changed).
 * Session-scoped events are handled by ClientBroadcastListener.
 *
 * @param io - Socket.io server instance
 * @param sessionManager - SessionManager instance (for fetching sessions list)
 * @param eventBus - GlobalEventBus instance
 */
export function setupGlobalEventListeners(
  io: SocketIOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
  sessionManager: SessionManager,
  eventBus: EventBus
): void {
  logger.info('Setting up GlobalEventBus → WebSocket bridge...');

  // ==========================================================================
  // Global Events (broadcast to all connected clients)
  // ==========================================================================

  /**
   * Sessions list changed - broadcast to all clients
   * This is the only global event that needs to be handled here.
   */
  eventBus.on('sessions:changed', async () => {
    try {
      const sessions = await sessionManager.getAllSessions();
      io.emit('sessions:list', sessions);
      logger.debug({ sessionCount: sessions.length }, 'Broadcast sessions list');
    } catch (error) {
      logger.error({ error }, 'Failed to broadcast sessions list');
    }
  });

  logger.info('GlobalEventBus → WebSocket bridge setup complete (1 global event listener registered)');
}

// ==========================================================================
// Legacy export for backwards compatibility during migration
// Can be removed once all imports are updated
// ==========================================================================

/**
 * @deprecated Use setupGlobalEventListeners instead.
 * Session-scoped events are now handled by ClientBroadcastListener.
 */
export const setupEventListeners = setupGlobalEventListeners;
