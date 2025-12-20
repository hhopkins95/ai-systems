/**
 * Session State Reducer
 *
 * Shared, immutable reducer for session conversation state.
 * Used by both server and client for consistent state management.
 */

// Main reducer
export { reduceSessionEvent, isConversationEvent } from './reducer.js';

// State types and factories (re-exported from shared-types via ./types.js)
export {
  type SessionConversationState,
  type SubagentState,
  type StreamingState,
  type StreamingContent,
  createInitialState,  // Alias for backward compatibility
  createSubagentState,
  findSubagent,
  findSubagentIndex,
} from './types.js';

// Also export the canonical name
export { createInitialConversationState } from '@ai-systems/shared-types';
