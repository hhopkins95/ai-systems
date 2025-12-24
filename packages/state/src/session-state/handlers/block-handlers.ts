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

import type {
  ConversationBlock,
  SessionEvent,
  BlockLifecycleStatus,
  PartialConversationBlock,
} from '@ai-systems/shared-types';
import type { SessionConversationState, SubagentState } from '../types.js';
import { findSubagentIndex } from '../types.js';

// ============================================================================
// Block Upsert Handler (Primary)
// ============================================================================

/**
 * Handle block:upsert event
 * - If block exists: merges partial data into existing block
 * - If block doesn't exist: creates full block with defaults for missing fields
 * - Routes to main or subagent conversation based on conversationId
 */
export function handleBlockUpsert(
  state: SessionConversationState,
  event: SessionEvent<'block:upsert'>
): SessionConversationState {
  const conversationId = event.context.conversationId ?? 'main';
  const partial = event.payload.block;

  return upsertBlock(state, partial, conversationId);
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
 * Check if a block is an empty text block that should be filtered out.
 * Empty assistant_text or thinking blocks with no content are considered ghost blocks
 * created during streaming that never received content.
 */
function isEmptyTextBlock(block: ConversationBlock): boolean {
  if (block.type === 'assistant_text' || block.type === 'thinking') {
    const content = (block as { content?: string }).content;
    return !content || content.trim() === '';
  }
  return false;
}

/**
 * Handle session:idle event
 * - Finalizes any blocks still in 'pending' status
 * - Filters out empty text blocks (ghost blocks from streaming)
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
    // Finalize pending blocks and filter out empty text blocks
    const hasAnyPending = state.blocks.some((b) => b.status === 'pending');
    const hasAnyEmpty = state.blocks.some(isEmptyTextBlock);
    if (!hasAnyPending && !hasAnyEmpty) return state;

    const newBlocks = state.blocks
      .filter((b) => !isEmptyTextBlock(b))
      .map((b) =>
        b.status === 'pending' ? { ...b, status: 'complete' as BlockLifecycleStatus } : b
      );
    return { ...state, blocks: newBlocks };
  } else {
    // Finalize pending blocks in subagent conversation
    const subagentIndex = findSubagentIndex(state, conversationId);
    if (subagentIndex < 0) return state;

    const subagent = state.subagents[subagentIndex];
    const hasAnyPending = subagent.blocks.some((b) => b.status === 'pending');
    const hasAnyEmpty = subagent.blocks.some(isEmptyTextBlock);
    if (!hasAnyPending && !hasAnyEmpty) return state;

    const newBlocks = subagent.blocks
      .filter((b) => !isEmptyTextBlock(b))
      .map((b) =>
        b.status === 'pending' ? { ...b, status: 'complete' as BlockLifecycleStatus } : b
      );

    const newSubagents = [...state.subagents];
    newSubagents[subagentIndex] = { ...subagent, blocks: newBlocks };

    return { ...state, subagents: newSubagents };
  }
}


// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get default values for a block type.
 * Used when creating blocks from partial data.
 */
function getBlockDefaults(type: ConversationBlock['type']): Record<string, unknown> {
  const baseDefaults: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    status: 'pending' as BlockLifecycleStatus,
  };

  switch (type) {
    case 'assistant_text':
      return { ...baseDefaults, content: '' };
    case 'thinking':
      return { ...baseDefaults, content: '' };
    case 'user_message':
      return { ...baseDefaults, content: '' };
    case 'tool_use':
      return { ...baseDefaults, toolName: '', toolUseId: '', input: {} };
    case 'tool_result':
      return { ...baseDefaults, toolUseId: '', output: null, isError: false };
    case 'system':
      return { ...baseDefaults, subtype: 'status', message: '' };
    case 'subagent':
      return { ...baseDefaults, input: '' };
    case 'error':
      return { ...baseDefaults, message: '' };
    case 'skill_load':
      return { ...baseDefaults, skillName: '', content: '' };
    default:
      return baseDefaults;
  }
}

/**
 * Create a full block from a partial block by merging with defaults.
 * Logs a warning if required fields are missing.
 */
function createBlockFromPartial(partial: PartialConversationBlock): ConversationBlock {
  const defaults = getBlockDefaults(partial.type);

  // Check if we're missing required fields (anything that would normally be required)
  const hasAllFields = Object.keys(defaults).every(
    (key) => key in partial || key === 'timestamp' || key === 'status'
  );

  if (!hasAllFields) {
    // eslint-disable-next-line no-console
    (globalThis as any).console?.warn?.(
      `[block:upsert] Creating block "${partial.id}" (${partial.type}) with default values for missing required fields`
    );
  }

  return { ...defaults, ...partial } as ConversationBlock;
}

/**
 * Upsert a block into the correct conversation (main or subagent)
 * - If block exists: merges partial into existing block
 * - If block doesn't exist: creates full block from partial + defaults
 */
function upsertBlock(
  state: SessionConversationState,
  partial: PartialConversationBlock,
  conversationId: string
): SessionConversationState {
  if (conversationId === 'main') {
    return upsertMainBlock(state, partial);
  } else {
    return upsertSubagentBlock(state, conversationId, partial);
  }
}

/**
 * Upsert a block into the main conversation
 * - If exists: merge partial into existing
 * - If new: create full block from partial + defaults
 */
function upsertMainBlock(
  state: SessionConversationState,
  partial: PartialConversationBlock
): SessionConversationState {
  const existingIndex = state.blocks.findIndex((b) => b.id === partial.id);

  if (existingIndex >= 0) {
    // Merge partial into existing block
    const existingBlock = state.blocks[existingIndex];
    const mergedBlock = { ...existingBlock, ...partial } as ConversationBlock;
    const newBlocks = [...state.blocks];
    newBlocks[existingIndex] = mergedBlock;
    return { ...state, blocks: newBlocks };
  } else {
    // Create new block from partial + defaults
    const fullBlock = createBlockFromPartial(partial);
    return { ...state, blocks: [...state.blocks, fullBlock] };
  }
}

/**
 * Upsert a block into a subagent conversation
 * Creates the subagent if it doesn't exist (defensive for out-of-order events)
 * - If exists: merge partial into existing
 * - If new: create full block from partial + defaults
 */
function upsertSubagentBlock(
  state: SessionConversationState,
  conversationId: string,
  partial: PartialConversationBlock
): SessionConversationState {
  const subagentIndex = findSubagentIndex(state, conversationId);

  if (subagentIndex < 0) {
    // Subagent doesn't exist - create it (defensive for out-of-order events)
    const fullBlock = createBlockFromPartial(partial);
    const newSubagent: SubagentState = {
      toolUseId: conversationId,
      blocks: [fullBlock],
      status: 'running',
    };
    return { ...state, subagents: [...state.subagents, newSubagent] };
  }

  // Update existing subagent
  const subagent = state.subagents[subagentIndex];
  const blockIndex = subagent.blocks.findIndex((b) => b.id === partial.id);

  let newBlocks: ConversationBlock[];
  if (blockIndex >= 0) {
    // Merge partial into existing block
    const existingBlock = subagent.blocks[blockIndex];
    const mergedBlock = { ...existingBlock, ...partial } as ConversationBlock;
    newBlocks = [...subagent.blocks];
    newBlocks[blockIndex] = mergedBlock;
  } else {
    // Create new block from partial + defaults
    const fullBlock = createBlockFromPartial(partial);
    newBlocks = [...subagent.blocks, fullBlock];
  }

  const newSubagents = [...state.subagents];
  newSubagents[subagentIndex] = { ...subagent, blocks: newBlocks };

  return { ...state, subagents: newSubagents };
}
