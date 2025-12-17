/**
 * Client Hub - Interface for broadcasting events to connected clients
 *
 * Abstracts the transport mechanism (Socket.IO, WebSocket, SSE, etc.)
 * so sessions can broadcast events without knowing the underlying transport.
 *
 * Uses the unified SessionEvent structure from shared-types - events flow
 * unchanged from runner → server → client.
 *
 * Implementations:
 * - SocketIOClientHub: Socket.IO rooms-based broadcasting
 * - MockClientHub: For testing
 * - Future: SSEClientHub, WebSocketClientHub, DurableObjectClientHub
 */

import type { AnySessionEvent } from '@ai-systems/shared-types';

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
   * Broadcast a session event to all clients subscribed to a session
   *
   * @param sessionId - The session to broadcast to
   * @param event - The full SessionEvent object (type + payload + context)
   */
  broadcast(sessionId: string, event: AnySessionEvent): void;

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
  /** Record of all broadcasts: [sessionId, event][] */
  readonly broadcasts: Array<{
    sessionId: string;
    event: AnySessionEvent;
  }> = [];

  /** Mock client counts per session */
  private clientCounts: Map<string, number> = new Map();

  broadcast(sessionId: string, event: AnySessionEvent): void {
    this.broadcasts.push({ sessionId, event });
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
  getBroadcastsByEventType(
    eventType: AnySessionEvent['type']
  ): typeof this.broadcasts {
    return this.broadcasts.filter((b) => b.event.type === eventType);
  }
}
