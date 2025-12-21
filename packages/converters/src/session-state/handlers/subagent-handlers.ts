/**
 * Subagent Event Handlers
 *
 * Pure functions for handling subagent lifecycle events in the session state reducer.
 * All handlers are immutable - they return new state objects.
 *
 * Lifecycle:
 * 1. subagent:spawned - Creates SubagentBlock in parent + SubagentState entry
 * 2. block:* events - Route to subagent's blocks via conversationId
 * 3. subagent:completed - Updates SubagentBlock and SubagentState with final state
 */

import type { SubagentBlock, SessionEvent, BlockLifecycleStatus } from '@ai-systems/shared-types';
import type { SessionConversationState, SubagentState } from '../types.js';
import { findSubagentIndex } from '../types.js';

// ============================================================================
// Subagent Spawned Handler
// ============================================================================

/**
 * Handle subagent:spawned event
 * - Creates SubagentBlock in parent conversation (status: pending)
 * - Creates SubagentState entry for the subagent's conversation
 * - Idempotent: skips if subagent with this toolUseId already exists
 */
export function handleSubagentSpawned(
  state: SessionConversationState,
  event: SessionEvent<'subagent:spawned'>
): SessionConversationState {
  const { toolUseId, prompt, subagentType, description } = event.payload;
  const conversationId = event.context.conversationId ?? 'main';
  const timestamp = event.context.timestamp ?? new Date().toISOString();

  // Idempotency check: skip if subagent already exists
  const existingIndex = findSubagentIndex(state, toolUseId);
  if (existingIndex >= 0) {
    return state;
  }

  // Create SubagentBlock in parent conversation
  const subagentBlock: SubagentBlock = {
    id: `subagent-block-${toolUseId}`,
    type: 'subagent',
    timestamp,
    status: 'pending' as BlockLifecycleStatus,
    toolUseId,
    name: subagentType,
    input: prompt,
  };

  // Create subagent entry for routing blocks
  const subagentEntry: SubagentState = {
    toolUseId,
    blocks: [],
    status: 'running',
    prompt,
  };

  // Add block to parent conversation
  let newBlocks: typeof state.blocks;
  if (conversationId === 'main') {
    newBlocks = [...state.blocks, subagentBlock];
  } else {
    // Nested subagent - add block to parent subagent's blocks
    const parentIndex = findSubagentIndex(state, conversationId);
    if (parentIndex >= 0) {
      const parent = state.subagents[parentIndex];
      const newParentBlocks = [...parent.blocks, subagentBlock];
      const newSubagents = [...state.subagents];
      newSubagents[parentIndex] = { ...parent, blocks: newParentBlocks };
      return {
        ...state,
        subagents: [...newSubagents, subagentEntry],
      };
    }
    // Parent not found, add to main as fallback
    newBlocks = [...state.blocks, subagentBlock];
  }

  return {
    ...state,
    blocks: newBlocks,
    subagents: [...state.subagents, subagentEntry],
  };
}

// ============================================================================
// Subagent Completed Handler
// ============================================================================

/**
 * Handle subagent:completed event
 * - Updates SubagentBlock with final status, output, agentId
 * - Updates SubagentState with final state
 */
export function handleSubagentCompleted(
  state: SessionConversationState,
  event: SessionEvent<'subagent:completed'>
): SessionConversationState {
  const { toolUseId, agentId, status, output, durationMs } = event.payload;

  // Map event status to final status
  const finalBlockStatus: BlockLifecycleStatus = status === 'completed' ? 'complete' : 'error';
  const finalSubagentStatus = status === 'completed' ? 'success' : 'error';

  // Update SubagentBlock - could be in main or nested in another subagent
  let newState = updateSubagentBlockInConversation(
    state,
    toolUseId,
    (block) => ({
      ...block,
      status: finalBlockStatus,
      subagentId: agentId ? `agent-${agentId}` : undefined,
      output,
      durationMs,
    })
  );

  // Update SubagentState entry
  const subagentIndex = findSubagentIndex(newState, toolUseId);
  if (subagentIndex >= 0) {
    const subagent = newState.subagents[subagentIndex];
    const newSubagents = [...newState.subagents];
    newSubagents[subagentIndex] = {
      ...subagent,
      agentId,
      status: finalSubagentStatus,
      output,
      durationMs,
    };
    newState = { ...newState, subagents: newSubagents };
  }

  return newState;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Find and update a SubagentBlock by toolUseId.
 * Searches main conversation and all subagent conversations.
 */
function updateSubagentBlockInConversation(
  state: SessionConversationState,
  toolUseId: string,
  updater: (block: SubagentBlock) => SubagentBlock
): SessionConversationState {
  // Check main conversation
  const mainIndex = state.blocks.findIndex(
    (b) => b.type === 'subagent' && (b as SubagentBlock).toolUseId === toolUseId
  );

  if (mainIndex >= 0) {
    const newBlocks = [...state.blocks];
    newBlocks[mainIndex] = updater(state.blocks[mainIndex] as SubagentBlock);
    return { ...state, blocks: newBlocks };
  }

  // Check subagent conversations
  for (let i = 0; i < state.subagents.length; i++) {
    const subagent = state.subagents[i];
    const blockIndex = subagent.blocks.findIndex(
      (b) => b.type === 'subagent' && (b as SubagentBlock).toolUseId === toolUseId
    );

    if (blockIndex >= 0) {
      const newBlocks = [...subagent.blocks];
      newBlocks[blockIndex] = updater(subagent.blocks[blockIndex] as SubagentBlock);

      const newSubagents = [...state.subagents];
      newSubagents[i] = { ...subagent, blocks: newBlocks };

      return { ...state, subagents: newSubagents };
    }
  }

  // Not found - return unchanged
  return state;
}
