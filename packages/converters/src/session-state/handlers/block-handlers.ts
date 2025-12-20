/**
 * Block Event Handlers
 *
 * Pure functions for handling block events in the session state reducer.
 * All handlers are immutable - they return new state objects.
 */

import type { ConversationBlock, SessionEvent } from '@ai-systems/shared-types';
import type {
  SessionConversationState,
  StreamingContent,
  SubagentState,
} from '../types.js';
import { findSubagentIndex } from '../types.js';

// ============================================================================
// Block Start Handler
// ============================================================================

/**
 * Handle block:start event
 * - Initializes streaming entry for the conversation
 * - Routes the initial block to main or subagent conversation
 */
export function handleBlockStart(
  state: SessionConversationState,
  event: SessionEvent<'block:start'>
): SessionConversationState {
  const conversationId = event.context.conversationId ?? 'main';
  const block = event.payload.block;

  // Initialize streaming entry for this conversation
  const newStreaming = new Map(state.streaming.byConversation);
  newStreaming.set(conversationId, {
    conversationId,
    blockId: block.id,
    content: '',
    startedAt: Date.now(),
  });

  // Route block to correct conversation with new streaming state
  const stateWithStreaming: SessionConversationState = {
    ...state,
    streaming: { byConversation: newStreaming },
  };

  return upsertBlock(stateWithStreaming, block, conversationId);
}

// ============================================================================
// Block Complete Handler
// ============================================================================

/**
 * Handle block:complete event
 * - Clears streaming entry for the conversation
 * - Upserts the finalized block
 */
export function handleBlockComplete(
  state: SessionConversationState,
  event: SessionEvent<'block:complete'>
): SessionConversationState {
  const conversationId = event.context.conversationId ?? 'main';
  const block = event.payload.block;

  // Clear streaming for this conversation
  const newStreaming = new Map(state.streaming.byConversation);
  newStreaming.delete(conversationId);

  const stateWithStreaming: SessionConversationState = {
    ...state,
    streaming: { byConversation: newStreaming },
  };

  return upsertBlock(stateWithStreaming, block, conversationId);
}

// ============================================================================
// Block Update Handler
// ============================================================================

/**
 * Handle block:update event
 * - Updates metadata/status on an existing block
 */
export function handleBlockUpdate(
  state: SessionConversationState,
  event: SessionEvent<'block:update'>
): SessionConversationState {
  const conversationId = event.context.conversationId ?? 'main';
  const { blockId, updates } = event.payload;

  if (conversationId === 'main') {
    // Update block in main conversation
    const blockIndex = state.blocks.findIndex((b) => b.id === blockId);
    if (blockIndex < 0) return state;

    const newBlocks = [...state.blocks];
    newBlocks[blockIndex] = { ...newBlocks[blockIndex], ...updates } as ConversationBlock;

    return { ...state, blocks: newBlocks };
  } else {
    // Update block in subagent conversation
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
// Block Delta Handler
// ============================================================================

/**
 * Handle block:delta event
 * - Appends text delta to streaming content
 */
export function handleBlockDelta(
  state: SessionConversationState,
  event: SessionEvent<'block:delta'>
): SessionConversationState {
  const conversationId = event.context.conversationId ?? 'main';
  const streaming = state.streaming.byConversation.get(conversationId);

  if (!streaming) {
    // No streaming entry - might have missed block:start, ignore delta
    return state;
  }

  const newStreaming = new Map(state.streaming.byConversation);
  newStreaming.set(conversationId, {
    ...streaming,
    content: streaming.content + event.payload.delta,
  });

  return { ...state, streaming: { byConversation: newStreaming } };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Upsert a block into the correct conversation (main or subagent)
 * If block exists, updates it. If not, appends it.
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
    // Update existing block
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
      id: conversationId,
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
    // Update existing block
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
