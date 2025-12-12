/**
 * Client Broadcast Listener - Bridges SessionEventBus to ClientHub
 *
 * Subscribes to session-scoped events (without sessionId in payload)
 * and broadcasts them to clients via ClientHub (with sessionId added).
 *
 * This is the connection point between the session's internal event system
 * and the external client communication layer.
 */

import type { ClientHub } from './client-hub.js';
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
    // Block streaming events
    this.eventBus.on('block:start', (data) => {
      this.clientHub.broadcast(this.sessionId, 'session:block:start', {
        sessionId: this.sessionId,
        conversationId: data.conversationId,
        block: data.block,
      });
    });

    this.eventBus.on('block:delta', (data) => {
      this.clientHub.broadcast(this.sessionId, 'session:block:delta', {
        sessionId: this.sessionId,
        conversationId: data.conversationId,
        blockId: data.blockId,
        delta: data.delta,
      });
    });

    this.eventBus.on('block:update', (data) => {
      this.clientHub.broadcast(this.sessionId, 'session:block:update', {
        sessionId: this.sessionId,
        conversationId: data.conversationId,
        blockId: data.blockId,
        updates: data.updates,
      });
    });

    this.eventBus.on('block:complete', (data) => {
      this.clientHub.broadcast(this.sessionId, 'session:block:complete', {
        sessionId: this.sessionId,
        conversationId: data.conversationId,
        blockId: data.blockId,
        block: data.block,
      });
    });

    // Status events
    this.eventBus.on('status:changed', (data) => {
      this.clientHub.broadcast(this.sessionId, 'session:status', {
        sessionId: this.sessionId,
        runtime: data.runtime,
      });
    });

    // File events
    this.eventBus.on('file:created', (data) => {
      this.clientHub.broadcast(this.sessionId, 'session:file:created', {
        sessionId: this.sessionId,
        file: data.file,
      });
    });

    this.eventBus.on('file:modified', (data) => {
      this.clientHub.broadcast(this.sessionId, 'session:file:modified', {
        sessionId: this.sessionId,
        file: data.file,
      });
    });

    this.eventBus.on('file:deleted', (data) => {
      this.clientHub.broadcast(this.sessionId, 'session:file:deleted', {
        sessionId: this.sessionId,
        path: data.path,
      });
    });

    // Metadata events
    this.eventBus.on('metadata:update', (data) => {
      this.clientHub.broadcast(this.sessionId, 'session:metadata:update', {
        sessionId: this.sessionId,
        conversationId: data.conversationId,
        metadata: data.metadata,
      });
    });

    // Subagent events
    this.eventBus.on('subagent:discovered', (data) => {
      this.clientHub.broadcast(this.sessionId, 'session:subagent:discovered', {
        sessionId: this.sessionId,
        subagent: data.subagent,
      });
    });

    this.eventBus.on('subagent:completed', (data) => {
      this.clientHub.broadcast(this.sessionId, 'session:subagent:completed', {
        sessionId: this.sessionId,
        subagentId: data.subagentId,
        status: data.status,
      });
    });

    // Log events
    this.eventBus.on('log', (data) => {
      this.clientHub.broadcast(this.sessionId, 'session:log', {
        sessionId: this.sessionId,
        level: data.level,
        message: data.message,
        data: data.data,
      });
    });

    // Error events
    this.eventBus.on('error', (data) => {
      this.clientHub.broadcast(this.sessionId, 'error', {
        sessionId: this.sessionId,
        message: data.message,
        code: data.code,
      });
    });

    // Options events
    this.eventBus.on('options:update', (data) => {
      this.clientHub.broadcast(this.sessionId, 'session:options:update', {
        sessionId: this.sessionId,
        options: data.options,
      });
    });
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  /**
   * Cleanup when session is destroyed
   * Note: EventBus.destroy() will remove all listeners,
   * so we don't need to explicitly remove them here
   */
  destroy(): void {
    // Nothing to cleanup - EventBus.destroy() handles listener removal
  }
}
