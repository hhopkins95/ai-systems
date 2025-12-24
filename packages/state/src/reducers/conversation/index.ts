/**
 * Session State Reducer
 *
 * Shared, immutable reducer for session conversation state.
 * Used by both server and client for consistent state management.
 *
 * Key design:
 * - No separate streaming state - content lives in blocks
 * - block:upsert is the primary event (replaces block:start/complete)
 * - Block status tracks lifecycle: pending → complete
 */

// Main reducer
export { reduceSessionEvent, isConversationEvent } from './reducer.js';

// State types and factories (re-exported from shared-types via ./types.js)
export {
  type SessionConversationState,
  type SubagentState,
  createInitialState,  // Alias for backward compatibility
  createSubagentState,
  findSubagent,
  findSubagentIndex,
} from './types.js';

// Also export the canonical name
export { createInitialConversationState } from '@ai-systems/shared-types';
