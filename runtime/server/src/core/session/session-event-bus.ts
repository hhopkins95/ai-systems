/**
 * Session Event Bus - Per-session typed event emitter
 *
 * Each AgentSession owns its own SessionEventBus instance.
 * Events use the unified SessionEvent structure from shared-types.
 *
 * Subscribers:
 * - ClientBroadcastListener: forwards events to connected clients
 * - PersistenceListener: handles storage sync
 */

import { EventEmitter } from 'events';
import type {
  SessionEventType,
  SessionEvent,
} from '@ai-systems/shared-types';
import { logger } from '../../config/logger';

// ============================================================================
// SessionEventBus Class
// ============================================================================

/**
 * Type-safe, per-session event bus
 *
 * Events use the unified SessionEvent structure: { type, payload, context }
 *
 * Usage:
 * ```typescript
 * const eventBus = new SessionEventBus('session-123');
 *
 * // Emit event (type-safe)
 * eventBus.emit('block:delta', createSessionEvent('block:delta', {
 *   blockId: 'b1',
 *   delta: 'Hello'
 * }, { sessionId: 'session-123', conversationId: 'main' }));
 *
 * // Listen to event (type-safe callback)
 * eventBus.on('block:delta', (event) => {
 *   console.log(event.payload.delta); // TypeScript knows this exists
 * });
 * ```
 */
export class SessionEventBus extends EventEmitter {
  /** The session this bus belongs to */
  readonly sessionId: string;

  constructor(sessionId: string) {
    super();
    this.sessionId = sessionId;
    // Increase max listeners since we may have multiple subscribers
    this.setMaxListeners(20);
  }

  /**
   * Emit a typed session event
   */
  override emit<K extends SessionEventType>(
    eventType: K,
    event: SessionEvent<K>
  ): boolean {
    return super.emit(eventType, event);
  }

  /**
   * Listen to a typed session event
   */
  override on<K extends SessionEventType>(
    eventType: K,
    listener: (event: SessionEvent<K>) => void
  ): this {
    return super.on(eventType, listener as (...args: unknown[]) => void);
  }

  /**
   * Listen once to a typed session event
   */
  override once<K extends SessionEventType>(
    eventType: K,
    listener: (event: SessionEvent<K>) => void
  ): this {
    return super.once(eventType, listener as (...args: unknown[]) => void);
  }

  /**
   * Remove a typed event listener
   */
  override off<K extends SessionEventType>(
    eventType: K,
    listener: (event: SessionEvent<K>) => void
  ): this {
    return super.off(eventType, listener as (...args: unknown[]) => void);
  }

  /**
   * Remove all listeners, optionally for a specific event
   */
  override removeAllListeners(eventType?: SessionEventType): this {
    return super.removeAllListeners(eventType);
  }

  /**
   * Destroy the event bus - removes all listeners
   *
   * IMPORTANT: This method removes ALL listeners registered on this bus,
   * including those from PersistenceListener and ClientBroadcastListener.
   * Those classes rely on this method for cleanup and do not track their
   * own listeners. Call this when the session is destroyed.
   */
  destroy(): void {
    this.removeAllListeners();
  }
}
