/**
 * WebSocket Event Schema for Agent Service
 *
 * Uses the unified SessionEvent structure from shared-types.
 * Events flow unchanged from runner → server → client via a single 'session:event' emission.
 *
 * Event structure: { type, payload, context }
 * - type: Event type (e.g., 'block:start', 'status', 'file:created')
 * - payload: Event-specific data
 * - context: Metadata (sessionId, conversationId, source, timestamp)
 */

import type { AnySessionEvent } from "@ai-systems/shared-types";

// ============================================================================
// Server → Client Events
// ============================================================================

export interface ServerToClientEvents {
  /**
   * Unified session event - all session events use this single handler
   *
   * The event object contains:
   * - type: The event type (e.g., 'block:start', 'block:delta', 'status', etc.)
   * - payload: Event-specific data
   * - context: Metadata including sessionId, conversationId, source, timestamp
   *
   * Client should switch on event.type to handle different event types.
   */
  'session:event': (event: AnySessionEvent) => void;

  /**
   * Connection-level error (not session-specific)
   * For errors that occur outside a session context
   */
  'error': (error: {
    message: string;
    code?: string;
    sessionId?: string;
  }) => void;
}

// ============================================================================
// Client → Server Events
// ============================================================================

export interface ClientToServerEvents {
  /**
   * Join session room to receive updates
   */
  'session:join': (
    sessionId: string,
    callback: (response: {
      success: boolean;
      error?: string;
    }) => void
  ) => void;

  /**
   * Leave session room
   */
  'session:leave': (
    sessionId: string,
    callback: (response: {
      success: boolean;
    }) => void
  ) => void;
}

// ============================================================================
// Inter-Server Events (for future multi-server coordination)
// ============================================================================

export interface InterServerEvents {
  // Reserved for Redis adapter multi-server coordination
}

// ============================================================================
// Socket Data (custom socket metadata)
// ============================================================================

export interface SocketData {
  sessionId?: string;
  userId?: string;
  joinedAt?: number;
}
