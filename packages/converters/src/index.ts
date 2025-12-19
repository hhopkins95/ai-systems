/**
 * @hhopkins/agent-converters
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
export * from './session-state/index.js';

// =============================================================================
// Unified Transcript Parsing
// =============================================================================

import type { AgentArchitecture, ParsedTranscript } from '@ai-systems/shared-types';
import { parseCombinedClaudeTranscript } from './claude-sdk/index.js';
import { parseOpenCodeTranscriptFile } from './opencode/index.js';

/**
 * Parse a transcript based on the agent architecture type.
 *
 * For Claude SDK: expects combined JSON format { main: string, subagents: [...] }
 * For OpenCode: expects native JSON format from `opencode export`
 *
 * @param architecture - The agent architecture type
 * @param rawTranscript - The raw transcript string
 * @returns Parsed blocks and subagent conversations
 */
export function parseTranscript(
  architecture: AgentArchitecture,
  rawTranscript: string
): ParsedTranscript {
  if (!rawTranscript) {
    return { blocks: [], subagents: [] };
  }

  switch (architecture) {
    case 'claude-sdk':
      return parseCombinedClaudeTranscript(rawTranscript);
    case 'opencode':
      return parseOpenCodeTranscriptFile(rawTranscript);
    default:
      return { blocks: [], subagents: [] };
  }
}
