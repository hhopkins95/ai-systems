/**
 * Session Conversation State Types
 *
 * Types for the shared session state reducer. This reducer handles
 * conversation blocks, subagent state, and streaming content.
 *
 * Used by both server (SessionState) and client (React reducer) to ensure
 * consistent state management across the system.
 */

import type { ConversationBlock, SubagentStatus } from '@ai-systems/shared-types';

// ============================================================================
// State Types
// ============================================================================

/**
 * Main session conversation state
 * Managed by the shared reducer, used by server and client.
 */
export interface SessionConversationState {
  /** Finalized conversation blocks in the main conversation */
  blocks: ConversationBlock[];

  /** Subagent conversations, keyed by toolUseId during streaming */
  subagents: SubagentState[];

  /** Active streaming state for text deltas */
  streaming: StreamingState;
}

/**
 * State for a single subagent conversation
 */
export interface SubagentState {
  /**
   * Primary key for this subagent.
   * During streaming: uses toolUseId
   * From transcript: may use agentId or toolUseId depending on source
   */
  id: string;

  /** Tool use ID from Task tool (available immediately during streaming) */
  toolUseId?: string;

  /** SDK agent ID (available after completion or from transcript) */
  agentId?: string;

  /** Conversation blocks within this subagent */
  blocks: ConversationBlock[];

  /** Current execution status */
  status: SubagentStatus;

  /** The prompt/task given to this subagent */
  prompt?: string;

  /** Final output from the subagent */
  output?: string;

  /** Execution duration in milliseconds */
  durationMs?: number;
}

/**
 * Streaming state for in-flight text content
 */
export interface StreamingState {
  /**
   * Active streaming content keyed by conversationId.
   * 'main' for main conversation, or subagent ID for subagent conversations.
   */
  byConversation: Map<string, StreamingContent>;
}

/**
 * Content being streamed for a single conversation
 */
export interface StreamingContent {
  /** Which conversation this belongs to ('main' or subagentId) */
  conversationId: string;

  /** The block ID being streamed */
  blockId: string;

  /** Accumulated text content from deltas */
  content: string;

  /** When streaming started (ms timestamp) */
  startedAt: number;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create initial empty state
 */
export function createInitialState(): SessionConversationState {
  return {
    blocks: [],
    subagents: [],
    streaming: { byConversation: new Map() },
  };
}

/**
 * Create initial subagent state
 */
export function createSubagentState(
  id: string,
  options: Partial<Omit<SubagentState, 'id'>> = {}
): SubagentState {
  return {
    id,
    blocks: [],
    status: 'pending',
    ...options,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Find a subagent by any of its identifiers (id, toolUseId, or agentId)
 */
export function findSubagent(
  state: SessionConversationState,
  ref: string
): SubagentState | undefined {
  return state.subagents.find(
    (s) => s.id === ref || s.toolUseId === ref || s.agentId === ref
  );
}

/**
 * Find the index of a subagent by any of its identifiers
 */
export function findSubagentIndex(
  state: SessionConversationState,
  ref: string
): number {
  return state.subagents.findIndex(
    (s) => s.id === ref || s.toolUseId === ref || s.agentId === ref
  );
}
