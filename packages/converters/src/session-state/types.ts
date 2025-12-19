/**
 * Session Conversation State Types
 *
 * Re-exported from @ai-systems/shared-types for backward compatibility.
 * The canonical types now live in the shared-types package.
 */

export {
  type SessionConversationState,
  type SubagentState,
  type StreamingState,
  type StreamingContent,
  createInitialConversationState,
  createSubagentState,
  findSubagent,
  findSubagentIndex,
} from '@ai-systems/shared-types';

// Alias for backward compatibility
export { createInitialConversationState as createInitialState } from '@ai-systems/shared-types';
