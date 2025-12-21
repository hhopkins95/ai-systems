/**
 * Block Event Handlers
 *
 * Pure functions for handling block events in the session state reducer.
 * All handlers are immutable - they return new state objects.
 *
 * Key design:
 * - No separate streaming state - content lives directly in blocks
 * - block:upsert creates or replaces blocks (replaces block:start/complete)
 * - block:delta appends to block.content directly
 * - Block status tracks lifecycle: pending → complete
 */

import type { ConversationBlock, SessionEvent, BlockLifecycleStatus } from '@ai-systems/shared-types';
import type { SessionConversationState, SubagentState } from '../types.js';
import { findSubagentIndex } from '../types.js';

// ============================================================================
// Block Upsert Handler (Primary)
// ============================================================================

/**
 * Handle block:upsert event
 * - Creates block if it doesn't exist
 * - Replaces block entirely if it exists (replace semantics, not merge)
 * - Routes to main or subagent conversation based on conversationId
 */
export function handleBlockUpsert(
  state: SessionConversationState,
  event: SessionEvent<'block:upsert'>
): SessionConversationState {
  const conversationId = event.context.conversationId ?? 'main';
  const block = event.payload.block;

  return upsertBlock(state, block, conversationId);
}

// ============================================================================
// Block Delta Handler
// ============================================================================

/**
 * Handle block:delta event
 * - Appends delta text directly to block.content
 * - Only applies to blocks that have a content field
 */
export function handleBlockDelta(
  state: SessionConversationState,
  event: SessionEvent<'block:delta'>
): SessionConversationState {
  const conversationId = event.context.conversationId ?? 'main';
  const { blockId, delta } = event.payload;

  if (!delta) return state; // Skip empty deltas

  if (conversationId === 'main') {
    const blockIndex = state.blocks.findIndex((b) => b.id === blockId);
    if (blockIndex < 0) return state; // Block not found, ignore

    const block = state.blocks[blockIndex];
    if (!('content' in block)) return state; // Block doesn't have content

    const newBlocks = [...state.blocks];
    newBlocks[blockIndex] = {
      ...block,
      content: ((block as any).content ?? '') + delta,
    } as ConversationBlock;

    return { ...state, blocks: newBlocks };
  } else {
    // Subagent conversation
    const subagentIndex = findSubagentIndex(state, conversationId);
    if (subagentIndex < 0) return state;

    const subagent = state.subagents[subagentIndex];
    const blockIndex = subagent.blocks.findIndex((b) => b.id === blockId);
    if (blockIndex < 0) return state;

    const block = subagent.blocks[blockIndex];
    if (!('content' in block)) return state;

    const newBlocks = [...subagent.blocks];
    newBlocks[blockIndex] = {
      ...block,
      content: ((block as any).content ?? '') + delta,
    } as ConversationBlock;

    const newSubagents = [...state.subagents];
    newSubagents[subagentIndex] = { ...subagent, blocks: newBlocks };

    return { ...state, subagents: newSubagents };
  }
}

// ============================================================================
// Session Idle Handler
// ============================================================================

/**
 * Handle session:idle event
 * - Finalizes any blocks still in 'pending' status
 * - Sets their status to 'complete'
 *
 * @param state - Current conversation state
 * @param conversationId - The conversation that became idle ('main' or subagent ID)
 */
export function handleSessionIdle(
  state: SessionConversationState,
  conversationId: string
): SessionConversationState {
  if (conversationId === 'main') {
    // Finalize pending blocks in main conversation
    const hasAnyPending = state.blocks.some((b) => b.status === 'pending');
    if (!hasAnyPending) return state;

    const newBlocks = state.blocks.map((b) =>
      b.status === 'pending' ? { ...b, status: 'complete' as BlockLifecycleStatus } : b
    );
    return { ...state, blocks: newBlocks };
  } else {
    // Finalize pending blocks in subagent conversation
    const subagentIndex = findSubagentIndex(state, conversationId);
    if (subagentIndex < 0) return state;

    const subagent = state.subagents[subagentIndex];
    const hasAnyPending = subagent.blocks.some((b) => b.status === 'pending');
    if (!hasAnyPending) return state;

    const newBlocks = subagent.blocks.map((b) =>
      b.status === 'pending' ? { ...b, status: 'complete' as BlockLifecycleStatus } : b
    );

    const newSubagents = [...state.subagents];
    newSubagents[subagentIndex] = { ...subagent, blocks: newBlocks };

    return { ...state, subagents: newSubagents };
  }
}

// ============================================================================
// Legacy Handlers (Deprecated - for backwards compatibility)
// ============================================================================

/**
 * @deprecated Use handleBlockUpsert instead
 * Handle block:start event - converts to upsert
 */
export function handleBlockStart(
  state: SessionConversationState,
  event: SessionEvent<'block:start'>
): SessionConversationState {
  const conversationId = event.context.conversationId ?? 'main';
  const block = event.payload.block;

  // Ensure block has pending status
  const blockWithStatus = { ...block, status: 'pending' as BlockLifecycleStatus };
  return upsertBlock(state, blockWithStatus, conversationId);
}

/**
 * @deprecated Use handleBlockUpsert instead
 * Handle block:complete event - converts to upsert with complete status
 */
export function handleBlockComplete(
  state: SessionConversationState,
  event: SessionEvent<'block:complete'>
): SessionConversationState {
  const conversationId = event.context.conversationId ?? 'main';
  const block = event.payload.block;

  // Ensure block has complete status
  const blockWithStatus = { ...block, status: 'complete' as BlockLifecycleStatus };
  return upsertBlock(state, blockWithStatus, conversationId);
}

/**
 * @deprecated Use handleBlockUpsert instead
 * Handle block:update event - merges updates into existing block
 */
export function handleBlockUpdate(
  state: SessionConversationState,
  event: SessionEvent<'block:update'>
): SessionConversationState {
  const conversationId = event.context.conversationId ?? 'main';
  const { blockId, updates } = event.payload;

  if (conversationId === 'main') {
    const blockIndex = state.blocks.findIndex((b) => b.id === blockId);
    if (blockIndex < 0) return state;

    const newBlocks = [...state.blocks];
    newBlocks[blockIndex] = { ...newBlocks[blockIndex], ...updates } as ConversationBlock;

    return { ...state, blocks: newBlocks };
  } else {
    const subagentIndex = findSubagentIndex(state, conversationId);
    if (subagentIndex < 0) return state;

    const subagent = state.subagents[subagentIndex];
    const blockIndex = subagent.blocks.findIndex((b) => b.id === blockId);
    if (blockIndex < 0) return state;

    const newBlocks = [...subagent.blocks];
    newBlocks[blockIndex] = { ...newBlocks[blockIndex], ...updates } as ConversationBlock;

    const newSubagents = [...state.subagents];
    newSubagents[subagentIndex] = { ...subagent, blocks: newBlocks };

    return { ...state, subagents: newSubagents };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Upsert a block into the correct conversation (main or subagent)
 * If block exists, replaces it. If not, appends it.
 */
function upsertBlock(
  state: SessionConversationState,
  block: ConversationBlock,
  conversationId: string
): SessionConversationState {
  if (conversationId === 'main') {
    return upsertMainBlock(state, block);
  } else {
    return upsertSubagentBlock(state, conversationId, block);
  }
}

/**
 * Upsert a block into the main conversation
 */
function upsertMainBlock(
  state: SessionConversationState,
  block: ConversationBlock
): SessionConversationState {
  const existingIndex = state.blocks.findIndex((b) => b.id === block.id);

  if (existingIndex >= 0) {
    // Replace existing block
    const newBlocks = [...state.blocks];
    newBlocks[existingIndex] = block;
    return { ...state, blocks: newBlocks };
  } else {
    // Append new block
    return { ...state, blocks: [...state.blocks, block] };
  }
}

/**
 * Upsert a block into a subagent conversation
 * Creates the subagent if it doesn't exist (defensive for out-of-order events)
 */
function upsertSubagentBlock(
  state: SessionConversationState,
  conversationId: string,
  block: ConversationBlock
): SessionConversationState {
  const subagentIndex = findSubagentIndex(state, conversationId);

  if (subagentIndex < 0) {
    // Subagent doesn't exist - create it (defensive for out-of-order events)
    const newSubagent: SubagentState = {
      toolUseId: conversationId,
      blocks: [block],
      status: 'running',
    };
    return { ...state, subagents: [...state.subagents, newSubagent] };
  }

  // Update existing subagent
  const subagent = state.subagents[subagentIndex];
  const blockIndex = subagent.blocks.findIndex((b) => b.id === block.id);

  let newBlocks: ConversationBlock[];
  if (blockIndex >= 0) {
    // Replace existing block
    newBlocks = [...subagent.blocks];
    newBlocks[blockIndex] = block;
  } else {
    // Append new block
    newBlocks = [...subagent.blocks, block];
  }

  const newSubagents = [...state.subagents];
  newSubagents[subagentIndex] = { ...subagent, blocks: newBlocks };

  return { ...state, subagents: newSubagents };
}
