/**
 * Client Hub - Interface for broadcasting events to connected clients
 *
 * Abstracts the transport mechanism (Socket.IO, WebSocket, SSE, etc.)
 * so sessions can broadcast events without knowing the underlying transport.
 *
 * Implementations:
 * - SocketIOClientHub: Socket.IO rooms-based broadcasting
 * - MockClientHub: For testing
 * - Future: SSEClientHub, WebSocketClientHub, DurableObjectClientHub
 */

import type {
  AgentArchitectureSessionOptions,
  ConversationBlock,
  SessionRuntimeState,
  WorkspaceFile,
} from '@ai-systems/shared-types';

// ============================================================================
// Client Hub Events Interface
// ============================================================================

/**
 * Events that can be broadcast to clients
 *
 * These map to ServerToClientEvents but are defined here to avoid
 * coupling ClientHub to the WebSocket types directly.
 */
export interface ClientHubEvents {
  // -------------------------------------------------------------------------
  // Block streaming events
  // -------------------------------------------------------------------------

  'session:block:start': {
    sessionId: string;
    conversationId: string;
    block: ConversationBlock;
  };

  'session:block:delta': {
    sessionId: string;
    conversationId: string;
    blockId: string;
    delta: string;
  };

  'session:block:update': {
    sessionId: string;
    conversationId: string;
    blockId: string;
    updates: Partial<ConversationBlock>;
  };

  'session:block:complete': {
    sessionId: string;
    conversationId: string;
    blockId: string;
    block: ConversationBlock;
  };

  // -------------------------------------------------------------------------
  // Status events
  // -------------------------------------------------------------------------

  'session:status': {
    sessionId: string;
    runtime: SessionRuntimeState;
  };

  // -------------------------------------------------------------------------
  // File events
  // -------------------------------------------------------------------------

  'session:file:created': {
    sessionId: string;
    file: WorkspaceFile;
  };

  'session:file:modified': {
    sessionId: string;
    file: WorkspaceFile;
  };

  'session:file:deleted': {
    sessionId: string;
    path: string;
  };

  // -------------------------------------------------------------------------
  // Metadata events
  // -------------------------------------------------------------------------

  'session:metadata:update': {
    sessionId: string;
    conversationId: string;
    metadata: Record<string, unknown>;
  };

  // -------------------------------------------------------------------------
  // Subagent events
  // -------------------------------------------------------------------------

  'session:subagent:discovered': {
    sessionId: string;
    subagent: {
      id: string;
      blocks: ConversationBlock[];
    };
  };

  'session:subagent:completed': {
    sessionId: string;
    subagentId: string;
    status: 'completed' | 'failed';
  };

  // -------------------------------------------------------------------------
  // Log/error events
  // -------------------------------------------------------------------------

  'session:log': {
    sessionId: string;
    level?: 'debug' | 'info' | 'warn' | 'error';
    message: string;
    data?: Record<string, unknown>;
  };

  'error': {
    sessionId: string;
    message: string;
    code?: string;
  };

  // -------------------------------------------------------------------------
  // Options events
  // -------------------------------------------------------------------------

  'session:options:update': {
    sessionId: string;
    options: AgentArchitectureSessionOptions;
  };
}

// ============================================================================
// ClientHub Interface
// ============================================================================

/**
 * Interface for broadcasting events to connected clients
 *
 * Implementations handle the actual transport mechanism.
 * Sessions use this interface to broadcast without knowing the transport.
 */
export interface ClientHub {
  /**
   * Broadcast an event to all clients subscribed to a session
   *
   * @param sessionId - The session to broadcast to
   * @param event - The event name (must be key of ClientHubEvents)
   * @param data - The event payload
   */
  broadcast<K extends keyof ClientHubEvents>(
    sessionId: string,
    event: K,
    data: ClientHubEvents[K]
  ): void;

  /**
   * Get the count of connected clients for a session
   *
   * @param sessionId - The session to check
   * @returns Number of connected clients
   */
  getClientCount(sessionId: string): number;
}

// ============================================================================
// Mock Implementation (for testing)
// ============================================================================

/**
 * Mock ClientHub for testing
 *
 * Records all broadcasts for assertions.
 */
export class MockClientHub implements ClientHub {
  /** Record of all broadcasts: [sessionId, event, data][] */
  readonly broadcasts: Array<{
    sessionId: string;
    event: keyof ClientHubEvents;
    data: ClientHubEvents[keyof ClientHubEvents];
  }> = [];

  /** Mock client counts per session */
  private clientCounts: Map<string, number> = new Map();

  broadcast<K extends keyof ClientHubEvents>(
    sessionId: string,
    event: K,
    data: ClientHubEvents[K]
  ): void {
    this.broadcasts.push({ sessionId, event, data });
  }

  getClientCount(sessionId: string): number {
    return this.clientCounts.get(sessionId) ?? 0;
  }

  // Test helpers

  /**
   * Set mock client count for a session
   */
  setClientCount(sessionId: string, count: number): void {
    this.clientCounts.set(sessionId, count);
  }

  /**
   * Clear all recorded broadcasts
   */
  clearBroadcasts(): void {
    this.broadcasts.length = 0;
  }

  /**
   * Get broadcasts for a specific session
   */
  getBroadcastsForSession(sessionId: string): typeof this.broadcasts {
    return this.broadcasts.filter((b) => b.sessionId === sessionId);
  }

  /**
   * Get broadcasts of a specific event type
   */
  getBroadcastsByEvent<K extends keyof ClientHubEvents>(
    event: K
  ): Array<{ sessionId: string; event: K; data: ClientHubEvents[K] }> {
    return this.broadcasts.filter((b) => b.event === event) as Array<{
      sessionId: string;
      event: K;
      data: ClientHubEvents[K];
    }>;
  }
}
