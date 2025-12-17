/**
 * Session Event Bus - Per-session typed event emitter
 *
 * Each AgentSession owns its own SessionEventBus instance.
 * Events are session-scoped (no sessionId in payloads - implicit from bus instance).
 *
 * Subscribers:
 * - ClientBroadcastListener: forwards events to connected clients
 * - PersistenceListener: handles storage sync
 */

import { EventEmitter } from 'events';
import type { ConversationBlock } from '@ai-systems/shared-types';
import type { AgentArchitectureSessionOptions } from '@ai-systems/shared-types';

// ============================================================================
// Session Events Interface
// ============================================================================

/**
 * Session-scoped events
 *
 * These events are scoped to a single session, eliminating the need
 * for sessionId in every payload (it's implicit from the bus instance).
 */
export interface SessionEvents {
  // -------------------------------------------------------------------------
  // Block streaming events (high frequency during query execution)
  // -------------------------------------------------------------------------

  /** New block started (may be incomplete, will receive deltas) */
  'block:start': {
    conversationId: string;
    block: ConversationBlock;
  };

  /** Text content streaming for a block */
  'block:delta': {
    conversationId: string;
    blockId: string;
    delta: string;
  };

  /** Block metadata/status updated (not text content) */
  'block:update': {
    conversationId: string;
    blockId: string;
    updates: Partial<ConversationBlock>;
  };

  /** Block finalized - no more updates coming */
  'block:complete': {
    conversationId: string;
    blockId: string;
    block: ConversationBlock;
  };

  // -------------------------------------------------------------------------
  // Metadata events
  // -------------------------------------------------------------------------

  /** Session-level metadata changed (tokens, cost, model) */
  'metadata:update': {
    conversationId: string;
    metadata: Record<string, unknown>;
  };

  // -------------------------------------------------------------------------
  // Runtime status events
  // -------------------------------------------------------------------------

  /** Session runtime state changed */
  'status:changed': {
    runtime: SessionRuntimeState;
  };

  // -------------------------------------------------------------------------
  // File events
  // -------------------------------------------------------------------------

  /** File created in workspace */
  'file:created': {
    file: WorkspaceFile;
  };

  /** File modified in workspace */
  'file:modified': {
    file: WorkspaceFile;
  };

  /** File deleted from workspace */
  'file:deleted': {
    path: string;
  };

  // -------------------------------------------------------------------------
  // Transcript events (for persistence)
  // -------------------------------------------------------------------------

  /** Combined transcript changed */
  'transcript:changed': {
    content: string;
  };

  // -------------------------------------------------------------------------
  // Subagent events
  // -------------------------------------------------------------------------

  /** New subagent discovered */
  'subagent:discovered': {
    subagent: {
      id: string;
      blocks: ConversationBlock[];
    };
  };

  /** Subagent completed */
  'subagent:completed': {
    subagentId: string;
    status: 'completed' | 'failed';
  };

  // -------------------------------------------------------------------------
  // Log/error events
  // -------------------------------------------------------------------------

  /** Operational log message */
  'log': {
    level?: 'debug' | 'info' | 'warn' | 'error';
    message: string;
    data?: Record<string, unknown>;
  };

  /** Error occurred */
  'error': {
    message: string;
    code?: string;
  };

  // -------------------------------------------------------------------------
  // Options events
  // -------------------------------------------------------------------------

  /** Session options updated */
  'options:update': {
    options: AgentArchitectureSessionOptions;
  };
}

// Import types used in SessionEvents
import type { SessionRuntimeState, WorkspaceFile } from '@ai-systems/shared-types';
import { logger } from '../../config/logger';

// ============================================================================
// SessionEventBus Class
// ============================================================================

/**
 * Type-safe, per-session event bus
 *
 * Usage:
 * ```typescript
 * const eventBus = new SessionEventBus('session-123');
 *
 * // Emit event (type-safe)
 * eventBus.emit('block:delta', { conversationId: 'main', blockId: 'b1', delta: 'Hello' });
 *
 * // Listen to event (type-safe callback)
 * eventBus.on('block:delta', (data) => {
 *   console.log(data.delta); // TypeScript knows this exists
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
  override emit<K extends keyof SessionEvents>(
    event: K,
    data: SessionEvents[K]
  ): boolean {
    logger.info("Emitting event: " + event);
    return super.emit(event, data);
  }

  /**
   * Listen to a typed session event
   */
  override on<K extends keyof SessionEvents>(
    event: K,
    listener: (data: SessionEvents[K]) => void
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  /**
   * Listen once to a typed session event
   */
  override once<K extends keyof SessionEvents>(
    event: K,
    listener: (data: SessionEvents[K]) => void
  ): this {
    return super.once(event, listener as (...args: unknown[]) => void);
  }

  /**
   * Remove a typed event listener
   */
  override off<K extends keyof SessionEvents>(
    event: K,
    listener: (data: SessionEvents[K]) => void
  ): this {
    return super.off(event, listener as (...args: unknown[]) => void);
  }

  /**
   * Remove all listeners, optionally for a specific event
   */
  override removeAllListeners(event?: keyof SessionEvents): this {
    return super.removeAllListeners(event);
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
