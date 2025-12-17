/**
 * Client Broadcast Listener - Bridges SessionEventBus to ClientHub
 *
 * Subscribes to session events and broadcasts them directly to clients.
 * With the unified event system, events flow unchanged from runner → server → client.
 *
 * This is the connection point between the session's internal event system
 * and the external client communication layer.
 */

import { CLIENT_BROADCAST_EVENT_TYPES, type AnySessionEvent } from '@ai-systems/shared-types';
import type { ClientHub } from '../host/client-hub.js';
import type { SessionEventBus } from './session-event-bus.js';

// ============================================================================
// ClientBroadcastListener Class
// ============================================================================

/**
 * Listens to SessionEventBus and broadcasts to ClientHub
 */
export class ClientBroadcastListener {
  private readonly sessionId: string;
  private readonly eventBus: SessionEventBus;
  private readonly clientHub: ClientHub;

  constructor(
    sessionId: string,
    eventBus: SessionEventBus,
    clientHub: ClientHub
  ) {
    this.sessionId = sessionId;
    this.eventBus = eventBus;
    this.clientHub = clientHub;

    this.setupListeners();
  }

  // =========================================================================
  // Event Listeners Setup
  // =========================================================================

  private setupListeners(): void {
    // Generic event forwarder for all broadcast event types
    // Events already have full SessionEvent structure with context.sessionId
    for (const eventType of CLIENT_BROADCAST_EVENT_TYPES) {
      this.eventBus.on(eventType, (event) => {
        // Cast to AnySessionEvent since TypeScript can't narrow the loop variable type
        this.clientHub.broadcast(this.sessionId, event as AnySessionEvent);
      });
    }
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  /**
   * Cleanup when session is destroyed
   *
   * Note: This class does NOT track its own event listeners.
   * Cleanup relies on SessionEventBus.destroy() being called by AgentSession,
   * which removes all listeners including ours. This is intentional to avoid
   * duplicate bookkeeping.
   *
   * @see SessionEventBus.destroy
   */
  destroy(): void {
    // Listeners are cleaned up by SessionEventBus.destroy()
  }
}
