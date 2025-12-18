/**
 * Transcript Parser - Parse OpenCode exported session files
 *
 * OpenCode stores sessions as JSON files that can be exported.
 * This parser converts the exported format to ConversationBlocks.
 */

import type { FileDiff, UserMessage, AssistantMessage, Part } from "@opencode-ai/sdk";
import type {
  ConversationBlock,
  SubagentBlock,
  ToolExecutionStatus,
  ParsedTranscript,
} from '@ai-systems/shared-types';
import { generateId, toISOTimestamp, noopLogger, type Logger } from '../utils.js';
import type { ParseTranscriptOptions } from '../types.js';

/**
 * Exported session type when running `opencode export <sessionId>`
 */
export interface OpenCodeSessionTranscript {
  info: {
    id: string;
    projectID: string;
    directory: string;
    parentID?: string;
    title: string;
    version: string;
    time: {
      created: number;
      updated: number;
      compacting?: number;
    };
    summary?: {
      additions: number;
      deletions: number;
      files: number;
      diffs?: FileDiff[];
    };
    share?: { url: string };
    revert?: { messageID: string; partID?: string; snapshot?: string; diff?: string };
  };
  messages: Array<{
    info: UserMessage | AssistantMessage;
    parts: Part[];
  }>;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Map OpenCode tool status to ToolExecutionStatus
 */
function mapToolStatus(status: string): ToolExecutionStatus {
  switch (status) {
    case 'pending':
      return 'pending';
    case 'running':
      return 'running';
    case 'completed':
      return 'success';
    case 'error':
      return 'error';
    default:
      return 'pending';
  }
}

/**
 * Get the start time from a part, falling back to current time
 */
function getPartTimestamp(part: Part): string {
  if ('time' in part && part.time && 'start' in part.time) {
    return toISOTimestamp(part.time.start);
  }
  return new Date().toISOString();
}

// ============================================================================
// Part Converters
// ============================================================================

/**
 * Convert a text part to AssistantTextBlock
 * Returns null if text is empty (filtered out)
 */
function convertTextPart(part: Part & { type: 'text' }, model?: string): ConversationBlock | null {
  // Skip empty text blocks - these occur when OpenCode exports before content is finalized
  if (!part.text?.trim()) {
    return null;
  }
  return {
    type: 'assistant_text',
    id: part.id,
    timestamp: getPartTimestamp(part),
    content: part.text,
    model,
  };
}

/**
 * Convert a reasoning part to ThinkingBlock
 * Returns null if text is empty (filtered out)
 */
function convertReasoningPart(part: Part & { type: 'reasoning' }): ConversationBlock | null {
  // Skip empty reasoning blocks - OpenCode exports reasoning parts without content
  if (!part.text?.trim()) {
    return null;
  }
  return {
    type: 'thinking',
    id: part.id,
    timestamp: getPartTimestamp(part),
    content: part.text,
  };
}

/**
 * Convert a tool part to ToolUseBlock + ToolResultBlock
 */
function convertToolPart(part: Part & { type: 'tool' }): ConversationBlock[] {
  const blocks: ConversationBlock[] = [];
  const state = part.state as any;

  // Create ToolUseBlock
  blocks.push({
    type: 'tool_use',
    id: part.id,
    timestamp: state.time?.start ? toISOTimestamp(state.time.start) : new Date().toISOString(),
    toolName: part.tool,
    toolUseId: part.callID,
    input: state.input || {},
    status: mapToolStatus(state.status),
    displayName: state.title,
  });

  // Create ToolResultBlock if completed or error
  if (state.status === 'completed' || state.status === 'error') {
    blocks.push({
      type: 'tool_result',
      id: generateId(),
      timestamp: state.time?.end ? toISOTimestamp(state.time.end) : new Date().toISOString(),
      toolUseId: part.callID,
      output: state.status === 'error' ? state.error : state.output,
      isError: state.status === 'error',
      durationMs: state.time?.end && state.time?.start
        ? state.time.end - state.time.start
        : undefined,
    });
  }

  return blocks;
}

/**
 * Convert agent part to SubagentBlock
 */
function convertAgentPart(part: Part & { type: 'agent' }): ConversationBlock {
  const p = part as any;
  return {
    type: 'subagent',
    id: part.id,
    timestamp: new Date().toISOString(),
    subagentId: p.name || generateId(),
    name: p.name,
    input: p.source?.value || '',
    status: 'success',
  };
}

/**
 * Convert subtask part to SubagentBlock
 */
function convertSubtaskPart(part: Part & { type: 'subtask' }): ConversationBlock {
  const p = part as any;
  return {
    type: 'subagent',
    id: part.id,
    timestamp: new Date().toISOString(),
    subagentId: generateId(),
    name: p.agent,
    input: p.prompt,
    status: 'pending',
  };
}

/**
 * Extract subagent from task tool part
 * Returns the SubagentBlock and recursively parsed subagent blocks
 */
function extractSubagentFromTaskTool(
  part: Part & { type: 'tool' },
  model: string | undefined,
  logger: Logger
): { subagentBlock: SubagentBlock; subagentBlocks: ConversationBlock[] } | null {
  const state = part.state as any;

  // Check if this is a task tool with subagent metadata
  if (part.tool !== 'task' || !state.metadata?.sessionId) {
    return null;
  }

  const sessionId = state.metadata.sessionId;
  const subagentBlocks: ConversationBlock[] = [];

  // Parse the summary parts if available (contains subagent's conversation)
  if (state.metadata.summary && Array.isArray(state.metadata.summary)) {
    for (const summaryPart of state.metadata.summary) {
      const converted = convertPartToBlocks(summaryPart, model, logger);
      subagentBlocks.push(...converted);
    }
  }

  // Create the SubagentBlock for the main conversation
  const subagentBlock: SubagentBlock = {
    type: 'subagent',
    id: part.id,
    timestamp: state.time?.start ? toISOTimestamp(state.time.start) : new Date().toISOString(),
    subagentId: sessionId,
    name: state.input?.subagent_type,
    input: state.input?.prompt || state.input?.description || '',
    status: mapToolStatus(state.status) as any,
    output: typeof state.output === 'string' ? state.output : undefined,
    durationMs: state.time?.end && state.time?.start
      ? state.time.end - state.time.start
      : undefined,
    toolUseId: part.callID,
  };

  return { subagentBlock, subagentBlocks };
}

/**
 * Convert a single part to ConversationBlocks
 */
function convertPartToBlocks(part: Part, model: string | undefined, logger: Logger): ConversationBlock[] {
  try {
    switch (part.type) {
      case 'text': {
        const block = convertTextPart(part as any, model);
        return block ? [block] : [];
      }

      case 'reasoning': {
        const block = convertReasoningPart(part as any);
        return block ? [block] : [];
      }

      case 'tool':
        // Don't convert task tools here - they're handled separately for subagent extraction
        if ((part as any).tool === 'task') {
          return [];
        }
        return convertToolPart(part as any);

      // Skip step events - they're operational logs, not conversation content
      case 'step-start':
      case 'step-finish':
      case 'retry':
        return [];

      case 'agent':
        return [convertAgentPart(part as any)];

      case 'subtask':
        return [convertSubtaskPart(part as any)];

      // Skip these part types - not displayed in conversation
      case 'file':
      case 'snapshot':
      case 'patch':
      case 'compaction':
        return [];

      default:
        logger.debug({ partType: (part as any).type }, 'Unknown OpenCode part type, skipping');
        return [];
    }
  } catch (error) {
    logger.error({ error, part }, 'Failed to convert OpenCode part to block');
    return [];
  }
}

// ============================================================================
// Main Parser
// ============================================================================

/**
 * Parse an OpenCode exported transcript file into ConversationBlocks
 *
 * @param content - JSON string content of the exported transcript
 * @param options - Optional configuration including logger
 * @returns Parsed blocks and extracted subagent conversations
 */
export function parseOpenCodeTranscriptFile(
  content: string,
  options: ParseTranscriptOptions = {}
): ParsedTranscript {
  const logger = options.logger ?? noopLogger;

  let transcript: OpenCodeSessionTranscript;
  try {
    transcript = JSON.parse(content) as OpenCodeSessionTranscript;
  } catch (error) {
    const preview = content.substring(0, 100);
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMsg, contentPreview: preview }, 'Failed to parse OpenCode transcript JSON');
    throw new Error(`Invalid OpenCode transcript JSON: ${errorMsg}. Content starts with: ${preview}...`);
  }
  const blocks: ConversationBlock[] = [];
  const subagentsMap = new Map<string, ConversationBlock[]>();

  for (const message of transcript.messages) {
    const { info, parts } = message;

    if (info.role === 'user') {
      // User message: extract text parts into a single UserMessageBlock
      const textParts = parts.filter(p => p.type === 'text') as Array<Part & { type: 'text' }>;
      const content = textParts.map(p => p.text).join('\n');

      if (content) {
        blocks.push({
          type: 'user_message',
          id: info.id,
          timestamp: toISOTimestamp(info.time.created),
          content,
        });
      }
    } else if (info.role === 'assistant') {
      const assistantInfo = info as AssistantMessage;
      const model = assistantInfo.modelID;

      // Process each part
      for (const part of parts) {
        // Special handling for task tools (subagent extraction)
        if (part.type === 'tool' && (part as any).tool === 'task') {
          const extracted = extractSubagentFromTaskTool(part as any, model, logger);
          if (extracted) {
            // Add SubagentBlock to main conversation
            blocks.push(extracted.subagentBlock);

            // Store subagent blocks
            if (extracted.subagentBlocks.length > 0) {
              subagentsMap.set(extracted.subagentBlock.subagentId, extracted.subagentBlocks);
            }
          } else {
            // If not a proper subagent, convert as regular tool
            blocks.push(...convertToolPart(part as any));
          }
        } else {
          // Regular part conversion
          blocks.push(...convertPartToBlocks(part, model, logger));
        }
      }
    }
  }

  // Convert subagents map to array
  const subagents = Array.from(subagentsMap.entries()).map(([id, blocks]) => ({
    id,
    blocks,
  }));

  return { blocks, subagents };
}

// Export helper functions for use in block converter
export { mapToolStatus, getPartTimestamp };
