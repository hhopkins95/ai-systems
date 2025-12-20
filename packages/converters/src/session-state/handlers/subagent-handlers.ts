/**
 * Subagent Event Handlers
 *
 * Pure functions for handling subagent lifecycle events in the session state reducer.
 * All handlers are immutable - they return new state objects.
 *
 * Lifecycle:
 * 1. subagent:spawned - Creates SubagentBlock in main + subagent entry
 * 2. block:* events - Route to subagent's blocks via conversationId
 * 3. subagent:completed - Updates SubagentBlock and subagent entry with final state
 */

import type { SubagentBlock, SessionEvent } from '@ai-systems/shared-types';
import type { SessionConversationState, SubagentState } from '../types.js';
import { findSubagentIndex } from '../types.js';

// ============================================================================
// Subagent Spawned Handler
// ============================================================================

/**
 * Handle subagent:spawned event
 * - Creates SubagentBlock in main conversation (status: running)
 * - Creates subagent entry for the subagent's conversation
 */
export function handleSubagentSpawned(
  state: SessionConversationState,
  event: SessionEvent<'subagent:spawned'>
): SessionConversationState {
  const { toolUseId, prompt, subagentType, description } = event.payload;
  const timestamp = event.context.timestamp ?? new Date().toISOString();

  // Create SubagentBlock in main conversation
  const subagentBlock: SubagentBlock = {
    id: `subagent-block-${toolUseId}`,
    type: 'subagent',
    timestamp,
    toolUseId,
    name: subagentType,
    input: prompt,
    status: 'running',
    // subagentId will be set on completion when agentId is available
  };

  // Create subagent entry for routing blocks
  const subagentEntry: SubagentState = {
    id: toolUseId,
    toolUseId,
    blocks: [],
    status: 'running',
    prompt,
  };

  return {
    ...state,
    blocks: [...state.blocks, subagentBlock],
    subagents: [...state.subagents, subagentEntry],
  };
}

// ============================================================================
// Subagent Completed Handler
// ============================================================================

/**
 * Handle subagent:completed event
 * - Updates SubagentBlock with final status, output, agentId
 * - Updates subagent entry with final state
 */
export function handleSubagentCompleted(
  state: SessionConversationState,
  event: SessionEvent<'subagent:completed'>
): SessionConversationState {
  const { toolUseId, agentId, status, output, durationMs } = event.payload;

  // Map event status to SubagentStatus
  const subagentStatus = status === 'completed' ? 'success' : 'error';

  // Update SubagentBlock in main conversation
  const blocks = state.blocks.map((b) => {
    if (b.type === 'subagent') {
      const subagentBlock = b as SubagentBlock;
      if (subagentBlock.toolUseId === toolUseId) {
        return {
          ...subagentBlock,
          subagentId: agentId ? `agent-${agentId}` : undefined,
          status: subagentStatus,
          output,
          durationMs,
        } as SubagentBlock;
      }
    }
    return b;
  });

  // Update subagent entry
  const subagentIndex = findSubagentIndex(state, toolUseId);
  if (subagentIndex < 0) {
    // Subagent not found - just update blocks
    return { ...state, blocks };
  }

  const subagent = state.subagents[subagentIndex];
  const newSubagents = [...state.subagents];
  newSubagents[subagentIndex] = {
    ...subagent,
    agentId,
    status: subagentStatus,
    output,
    durationMs,
  };

  return { ...state, blocks, subagents: newSubagents };
}
