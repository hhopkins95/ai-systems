/**
 * Unified Session Event System
 *
 * A single event type that flows unchanged from runner → server → client.
 * Events have a consistent structure: { type, payload, context }
 *
 * Context is enriched (not transformed) as events flow through the system:
 * - Runner: Sets source='runner', conversationId
 * - Server: Adds sessionId
 * - Client: Receives complete event
 *
 * This replaces the previous three-layer system:
 * - StreamEvents (runner output)
 * - SessionEvents (server event bus)
 * - ClientHubEvents/ServerToClientEvents (client communication)
 */

import type { ConversationBlock } from './blocks.js';
import type { AgentArchitectureSessionOptions } from './architecture.js';
import type { WorkspaceFile, SessionRuntimeState } from './session.js';

// ============================================================================
// Event Context
// ============================================================================

/**
 * Event context - enriched as event flows through system
 *
 * The context grows as the event passes through each layer:
 * - Runner adds: source, conversationId (for block events), timestamp
 * - Server adds: sessionId
 */
export interface SessionEventContext {
  /**
   * Session this event belongs to.
   * Added by server (runner doesn't know sessionId).
   */
  sessionId: string;

  /**
   * Conversation thread for block events.
   * 'main' for the primary conversation, or a subagent ID.
   */
  conversationId?: string;

  /**
   * Where the event originated.
   * - 'runner': Event from agent execution (block events, metadata, logs)
   * - 'server': Event from server layer (file events, transcript changes)
   */
  source?: 'runner' | 'server';

  /**
   * ISO timestamp when the event was created.
   */
  timestamp?: string;
}

// ============================================================================
// Metadata Types
// ============================================================================

/**
 * Token usage statistics
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  thinkingTokens?: number;
  totalTokens: number;
}

/**
 * Session metadata (tokens, cost, model info)
 */
export interface SessionMetadata {
  /**
   * Token usage for the current response
   */
  usage?: TokenUsage;

  /**
   * Cost in USD
   */
  costUSD?: number;

  /**
   * Model being used
   */
  model?: string;

  /**
   * Additional arbitrary metadata
   */
  [key: string]: unknown;
}

// ============================================================================
// Log Level
// ============================================================================

/**
 * Log levels for operational events
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// ============================================================================
// Event Payloads - Single Source of Truth
// ============================================================================

/**
 * All event payloads indexed by event type.
 *
 * This is the single source of truth for event data structures.
 * Add new event types here and they'll be available throughout the system.
 */
export interface SessionEventPayloads {
  // ---------------------------------------------------------------------------
  // Block Streaming Events (high frequency during query execution)
  // ---------------------------------------------------------------------------

  /**
   * New block started (may be incomplete, will receive deltas)
   */
  'block:start': {
    block: ConversationBlock;
  };

  /**
   * Text content streaming for a block
   */
  'block:delta': {
    blockId: string;
    delta: string;
  };

  /**
   * Block metadata/status updated (not text content)
   */
  'block:update': {
    blockId: string;
    updates: Partial<ConversationBlock>;
  };

  /**
   * Block finalized - no more updates coming
   */
  'block:complete': {
    blockId: string;
    block: ConversationBlock;
  };

  // ---------------------------------------------------------------------------
  // Metadata Events
  // ---------------------------------------------------------------------------

  /**
   * Session-level metadata changed (tokens, cost, model)
   */
  'metadata:update': {
    metadata: SessionMetadata;
  };

  // ---------------------------------------------------------------------------
  // Runtime Status Events
  // ---------------------------------------------------------------------------

  /**
   * Session runtime state changed
   */
  'status': {
    runtime: SessionRuntimeState;
  };

  // ---------------------------------------------------------------------------
  // File Events (server-originated)
  // ---------------------------------------------------------------------------

  /**
   * File created in workspace
   */
  'file:created': {
    file: WorkspaceFile;
  };

  /**
   * File modified in workspace
   */
  'file:modified': {
    file: WorkspaceFile;
  };

  /**
   * File deleted from workspace
   */
  'file:deleted': {
    path: string;
  };

  // ---------------------------------------------------------------------------
  // Transcript Events (server-originated)
  // ---------------------------------------------------------------------------

  /**
   * Combined transcript changed
   */
  'transcript:changed': {
    content: string;
  };

  // ---------------------------------------------------------------------------
  // Subagent Events
  // ---------------------------------------------------------------------------

  /**
   * New subagent discovered
   */
  'subagent:discovered': {
    subagent: {
      id: string;
      blocks: ConversationBlock[];
    };
  };

  /**
   * Subagent completed
   */
  'subagent:completed': {
    subagentId: string;
    status: 'completed' | 'failed';
  };

  // ---------------------------------------------------------------------------
  // Operational Events
  // ---------------------------------------------------------------------------

  /**
   * Operational log message
   */
  'log': {
    level?: LogLevel;
    message: string;
    data?: Record<string, unknown>;
  };

  /**
   * Error occurred
   */
  'error': {
    message: string;
    code?: string;
    data?: Record<string, unknown>;
  };

  // ---------------------------------------------------------------------------
  // Options Events
  // ---------------------------------------------------------------------------

  /**
   * Session options updated
   */
  'options:update': {
    options: AgentArchitectureSessionOptions;
  };
}

// ============================================================================
// Event Type Names
// ============================================================================

/**
 * All valid event type names
 */
export type SessionEventType = keyof SessionEventPayloads;

// ============================================================================
// Unified Session Event Type
// ============================================================================

/**
 * A session event with a specific type.
 *
 * Use this when you know the exact event type:
 * ```typescript
 * const event: SessionEvent<'block:start'> = {
 *   type: 'block:start',
 *   payload: { block: myBlock },
 *   context: { sessionId: '123', conversationId: 'main' }
 * };
 * ```
 */
export type SessionEvent<K extends SessionEventType = SessionEventType> = {
  type: K;
  payload: SessionEventPayloads[K];
  context: SessionEventContext;
};

/**
 * Discriminated union of all session events.
 *
 * Use this when handling events of unknown type:
 * ```typescript
 * function handleEvent(event: AnySessionEvent) {
 *   switch (event.type) {
 *     case 'block:start':
 *       // TypeScript knows event.payload is { block: ConversationBlock }
 *       break;
 *   }
 * }
 * ```
 */
export type AnySessionEvent = {
  [K in SessionEventType]: SessionEvent<K>;
}[SessionEventType];

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a session event with proper structure.
 *
 * @param type - The event type
 * @param payload - The event payload
 * @param context - Partial context (sessionId can be empty, filled by server)
 *
 * @example
 * ```typescript
 * const event = createSessionEvent('block:start', { block: myBlock }, {
 *   conversationId: 'main',
 *   source: 'runner'
 * });
 * ```
 */
export function createSessionEvent<K extends SessionEventType>(
  type: K,
  payload: SessionEventPayloads[K],
  context: Partial<SessionEventContext> = {}
): SessionEvent<K> {
  return {
    type,
    payload,
    context: {
      sessionId: context.sessionId ?? '',
      conversationId: context.conversationId,
      source: context.source,
      timestamp: context.timestamp ?? new Date().toISOString(),
    },
  };
}

/**
 * Enrich an event's context without modifying its payload.
 *
 * Used by the server to add sessionId to events from the runner.
 *
 * @param event - The event to enrich
 * @param additions - Context fields to add/override
 *
 * @example
 * ```typescript
 * const enriched = enrichEventContext(runnerEvent, {
 *   sessionId: 'session-123'
 * });
 * ```
 */
export function enrichEventContext<K extends SessionEventType>(
  event: SessionEvent<K>,
  additions: Partial<SessionEventContext>
): SessionEvent<K> {
  return {
    ...event,
    context: { ...event.context, ...additions },
  };
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for checking if an event is of a specific type.
 *
 * @example
 * ```typescript
 * if (isSessionEventType(event, 'block:start')) {
 *   // event.payload is { block: ConversationBlock }
 * }
 * ```
 */
export function isSessionEventType<K extends SessionEventType>(
  event: AnySessionEvent,
  type: K
): event is Extract<AnySessionEvent, { type: K }> {
  return event.type === type;
}

/**
 * Check if an event is a block-related event
 */
export function isBlockEvent(event: AnySessionEvent): boolean {
  return event.type.startsWith('block:');
}

/**
 * Check if an event is a file-related event
 */
export function isFileEvent(event: AnySessionEvent): boolean {
  return event.type.startsWith('file:');
}

/**
 * Check if an event is a subagent-related event
 */
export function isSubagentEvent(event: AnySessionEvent): boolean {
  return event.type.startsWith('subagent:');
}

/**
 * Check if an event originated from the runner
 */
export function isRunnerEvent(event: AnySessionEvent): boolean {
  return event.context.source === 'runner';
}

/**
 * Check if an event originated from the server
 */
export function isServerEvent(event: AnySessionEvent): boolean {
  return event.context.source === 'server';
}

// ============================================================================
// Event Categories (for filtering/routing)
// ============================================================================

/**
 * Block event types
 */
export const BLOCK_EVENT_TYPES = [
  'block:start',
  'block:delta',
  'block:update',
  'block:complete',
] as const satisfies readonly SessionEventType[];

/**
 * File event types
 */
export const FILE_EVENT_TYPES = [
  'file:created',
  'file:modified',
  'file:deleted',
] as const satisfies readonly SessionEventType[];

/**
 * Subagent event types
 */
export const SUBAGENT_EVENT_TYPES = [
  'subagent:discovered',
  'subagent:completed',
] as const satisfies readonly SessionEventType[];

/**
 * All event types that should be broadcast to clients
 */
export const CLIENT_BROADCAST_EVENT_TYPES = [
  'block:start',
  'block:delta',
  'block:update',
  'block:complete',
  'metadata:update',
  'status',
  'file:created',
  'file:modified',
  'file:deleted',
  'subagent:discovered',
  'subagent:completed',
  'log',
  'error',
  'options:update',
] as const satisfies readonly SessionEventType[];

// ============================================================================
// Script Output (for non-streaming runner responses)
// ============================================================================

/**
 * Output format for non-streaming CLI script results.
 * Used by the server to parse results from runner subprocess stdout.
 *
 * This is separate from SessionEvent as it represents script completion,
 * not streaming events.
 */
export interface ScriptOutput<T = unknown> {
  type: 'script_output';
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Type guard to check if a parsed JSON is a ScriptOutput
 */
export function isScriptOutput(obj: unknown): obj is ScriptOutput {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    (obj as ScriptOutput).type === 'script_output'
  );
}
