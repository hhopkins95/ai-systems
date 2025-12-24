/**
 * @ai-systems/state
 *
 * Pure transformation functions for parsing agent transcripts
 * and converting SDK-specific messages to architecture-agnostic
 * ConversationBlocks and SessionEvents.
 *
 * This package provides converters for:
 * - Claude SDK (Anthropic's agent SDK)
 * - OpenCode SDK
 *
 * All types are re-exported from @ai-systems/shared-types for convenience.
 */

// Re-export all types from shared-types
export type {
  // Block types
  ConversationBlock,
  UserMessageBlock,
  AssistantTextBlock,
  ToolUseBlock,
  ToolResultBlock,
  ThinkingBlock,
  SystemBlock,
  SubagentBlock,
  ErrorBlock,
  BaseBlock,
  BlockLifecycleStatus,
  TextContent,
  ImageContent,
  ContentPart,
  MessageContent,
  ToolExecutionStatus,
  SubagentStatus,
  ToolIO,
  // Session event types
  SessionEvent,
  AnySessionEvent,
  SessionEventType,
  SessionEventPayloads,
  SessionEventContext,
  // Conversation state types
  SessionConversationState,
  SubagentState,
} from '@ai-systems/shared-types';

// Re-export type guards and helpers from shared-types
export {
  // Block type guards
  isUserMessageBlock,
  isAssistantTextBlock,
  isToolUseBlock,
  isToolResultBlock,
  isThinkingBlock,
  isSystemBlock,
  isSubagentBlock,
  isErrorBlock,
  // Session event helpers
  createSessionEvent,
  enrichEventContext,
  isSessionEventType,
  isBlockEvent,
  isFileEvent,
  isSubagentEvent,
  // Conversation state helpers
  createInitialConversationState,
  createSubagentState,
  findSubagent,
  findSubagentIndex,
} from '@ai-systems/shared-types';

// Utilities
export {
  generateId,
  toISOTimestamp,
  type Logger,
  noopLogger,
  createConsoleLogger,
} from './utils.js';

// Internal converter types
export * from './types.js';

// Session state reducer (shared between server and client)
export * from './reducers/conversation-state/index.js';

// OpenCode helpers
export { extractSubagentSessionIds } from './converters/opencode/index.js';

// =============================================================================
// Unified Transcript Parsing
// =============================================================================

import type { AgentArchitecture, SessionConversationState } from '@ai-systems/shared-types';
import { createInitialConversationState } from '@ai-systems/shared-types';
import { parseCombinedClaudeTranscript } from './converters/claude-sdk/index.js';
import { parseCombinedOpenCodeTranscript } from './converters/opencode/index.js';

/**
 * Parse a transcript based on the agent architecture type.
 *
 * Both architectures expect combined JSON format { main: string, subagents: [...] }
 * containing the main transcript and all subagent transcripts bundled together.
 *
 * @param architecture - The agent architecture type
 * @param rawTranscript - The raw transcript string
 * @returns SessionConversationState with blocks and subagents
 */
export function parseTranscript(
  architecture: AgentArchitecture,
  rawTranscript: string
): SessionConversationState {
  if (!rawTranscript) {
    return createInitialConversationState();
  }

  switch (architecture) {
    case 'claude-sdk':
      return parseCombinedClaudeTranscript(rawTranscript);
    case 'opencode':
      return parseCombinedOpenCodeTranscript(rawTranscript);
    default:
      return createInitialConversationState();
  }
}
