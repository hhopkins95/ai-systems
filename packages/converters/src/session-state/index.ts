/**
 * Session State Reducer
 *
 * Shared, immutable reducer for session conversation state.
 * Used by both server and client for consistent state management.
 */

// Main reducer
export { reduceSessionEvent, isConversationEvent } from './reducer.js';

// State types and factories
export {
  type SessionConversationState,
  type SubagentState,
  type StreamingState,
  type StreamingContent,
  createInitialState,
  createSubagentState,
  findSubagent,
  findSubagentIndex,
} from './types.js';
