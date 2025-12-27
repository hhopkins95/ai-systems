/**
 * Session Conversation State Types
 *
 * Types for the shared session state reducer. This reducer handles
 * conversation blocks and subagent state.
 *
 * Used by both server (SessionState) and client (React reducer) to ensure
 * consistent state management across the system.
 *
 * Key design principles:
 * - Single source of truth: block content lives in the block, not separate streaming state
 * - Immutable updates: reducer returns new state, never mutates
 * - Block status tracks lifecycle: pending → complete (or error)
 */

import type { ConversationBlock, SubagentStatus } from '../conversation-blocks.js';

// ============================================================================
// State Types
// ============================================================================

/**
 * Main session conversation state
 * Managed by the shared reducer, used by server and client.
 */
export interface SessionConversationState {
  /** Conversation blocks in the main conversation */
  blocks: ConversationBlock[];

  /** Subagent conversations (nested threads) */
  subagents: SubagentState[];
}

/**
 * State for a single subagent conversation
 *
 * Identification:
 * - toolUseId: Available immediately when Task tool starts (primary key during streaming)
 * - agentId: Available after completion or from transcript
 * - Lookup functions check both
 */
export interface SubagentState {
  /**
   * Tool use ID from Task tool invocation.
   * Primary key - always available, used for routing during streaming.
   */
  toolUseId: string;

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

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create initial conversation state
 */
export function createInitialConversationState(): SessionConversationState {
  return { blocks: [], subagents: [] };
}

/**
 * Create initial subagent state
 */
export function createSubagentState(
  toolUseId: string,
  options: Partial<Omit<SubagentState, 'toolUseId'>> = {}
): SubagentState {
  return {
    toolUseId,
    blocks: [],
    status: 'pending',
    ...options,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Find a subagent by toolUseId or agentId.
 * Checks toolUseId first (primary key during streaming).
 */
export function findSubagent(
  state: SessionConversationState,
  ref: string
): SubagentState | undefined {
  // Check toolUseId first (primary key)
  return (
    state.subagents.find((s) => s.toolUseId === ref) ??
    state.subagents.find((s) => s.agentId === ref)
  );
}

/**
 * Find the index of a subagent by toolUseId or agentId.
 * Checks toolUseId first (primary key during streaming).
 */
export function findSubagentIndex(
  state: SessionConversationState,
  ref: string
): number {
  // Check toolUseId first (primary key)
  let idx = state.subagents.findIndex((s) => s.toolUseId === ref);
  if (idx < 0) {
    idx = state.subagents.findIndex((s) => s.agentId === ref);
  }
  return idx;
}
