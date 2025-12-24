/**
 * OpenCode Shared Helpers
 *
 * Common functions used by both block-converter.ts (streaming) and
 * transcript-parser.ts (transcript loading) to ensure consistent
 * block conversion logic.
 */

import type { Part } from "@opencode-ai/sdk";
import type {
  ConversationBlock,
  SubagentBlock,
  BlockLifecycleStatus,
  AnySessionEvent,
  OpenCodeSessionTranscript,
} from '@ai-systems/shared-types';
import { createSessionEvent } from '@ai-systems/shared-types';
import { generateId, toISOTimestamp, noopLogger, type Logger } from '../../utils.js';

// ============================================================================
// Status and Timestamp Helpers
// ============================================================================

/**
 * Map OpenCode tool/part status to BlockLifecycleStatus.
 * BlockLifecycleStatus tracks whether block data is finalized, not execution result.
 * - pending/running → 'pending' (still being built)
 * - completed/error → 'complete' (finalized, execution result in ToolResultBlock)
 */
export function mapToBlockStatus(status: string): BlockLifecycleStatus {
  switch (status) {
    case 'completed':
    case 'error':
      return 'complete';
    case 'pending':
    case 'running':
    default:
      return 'pending';
  }
}

/**
 * Get the start time from a part, falling back to current time
 */
export function getPartTimestamp(part: Part): string {
  if ('time' in part && part.time && 'start' in part.time) {
    return toISOTimestamp(part.time.start);
  }
  return new Date().toISOString();
}

// ============================================================================
// Task Tool Detection
// ============================================================================

/**
 * Check if a tool part is a task (subagent) tool
 */
export function isTaskTool(part: Part): boolean {
  return part.type === 'tool' && part.tool === 'task';
}

/**
 * Extract all subagent session IDs from an OpenCode transcript.
 * Scans task tool parts for metadata.sessionId.
 *
 * @param transcript - The parsed OpenCode session transcript
 * @returns Array of unique subagent session IDs
 */
export function extractSubagentSessionIds(transcript: OpenCodeSessionTranscript): string[] {
  const ids = new Set<string>();

  for (const message of transcript.messages) {
    for (const part of message.parts) {
      if (isTaskTool(part)) {
        // Type narrowing: we know this is a tool part with task
        const toolPart = part as Part & { type: 'tool' };
        const state = toolPart.state;
        if (state && typeof state === 'object' && 'metadata' in state) {
          const metadata = (state as { metadata?: { sessionId?: string } }).metadata;
          if (metadata?.sessionId) {
            ids.add(metadata.sessionId);
          }
        }
      }
    }
  }

  return Array.from(ids);
}

// ============================================================================
// Part to Block Converters
// ============================================================================

/**
 * Convert a text part to AssistantTextBlock
 * Returns null if text is empty (filtered out)
 */
export function convertTextPart(part: Part & { type: 'text' }, model?: string): ConversationBlock | null {
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
export function convertReasoningPart(part: Part & { type: 'reasoning' }): ConversationBlock | null {
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
export function convertToolPart(part: Part & { type: 'tool' }): ConversationBlock[] {
  const blocks: ConversationBlock[] = [];
  const state = part.state as any;
  const isComplete = state.status === 'completed' || state.status === 'error';

  // Create ToolUseBlock with lifecycle status
  blocks.push({
    type: 'tool_use',
    id: part.id,
    timestamp: state.time?.start ? toISOTimestamp(state.time.start) : new Date().toISOString(),
    toolName: part.tool,
    toolUseId: part.callID,
    input: state.input || {},
    status: isComplete ? 'complete' : 'pending' as BlockLifecycleStatus,
    displayName: state.title,
  });

  // Create ToolResultBlock if completed or error
  if (isComplete) {
    blocks.push({
      type: 'tool_result',
      id: generateId(),
      timestamp: state.time?.end ? toISOTimestamp(state.time.end) : new Date().toISOString(),
      toolUseId: part.callID,
      output: state.status === 'error' ? state.error : state.output,
      isError: state.status === 'error',
      status: 'complete' as BlockLifecycleStatus,
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
export function convertAgentPart(part: Part & { type: 'agent' }): ConversationBlock {
  const p = part as any;
  return {
    type: 'subagent',
    id: part.id,
    timestamp: new Date().toISOString(),
    subagentId: p.name || generateId(),
    name: p.name,
    input: p.source?.value || '',
    status: 'complete' as BlockLifecycleStatus,
  };
}

/**
 * Convert subtask part to SubagentBlock
 */
export function convertSubtaskPart(part: Part & { type: 'subtask' }): ConversationBlock {
  const p = part as any;
  return {
    type: 'subagent',
    id: part.id,
    timestamp: new Date().toISOString(),
    subagentId: generateId(),
    name: p.agent,
    input: p.prompt,
    status: 'pending' as BlockLifecycleStatus,
  };
}

// ============================================================================
// Subagent Extraction
// ============================================================================

/**
 * Extract SubagentBlock from a task tool part.
 * Used by streaming converter to create SubagentBlock on task start.
 */
export function extractSubagentBlock(part: Part & { type: 'tool' }): SubagentBlock | null {
  const state = part.state as any;

  if (!state.metadata?.sessionId) {
    return null;
  }

  const isComplete = state.status === 'completed' || state.status === 'error';

  return {
    type: 'subagent',
    id: part.id,
    timestamp: state.time?.start ? toISOTimestamp(state.time.start) : new Date().toISOString(),
    subagentId: state.metadata.sessionId,
    name: state.input?.subagent_type,
    input: state.input?.prompt || state.input?.description || '',
    status: isComplete ? 'complete' : 'pending' as BlockLifecycleStatus,
    output: typeof state.output === 'string' ? state.output : undefined,
    durationMs: state.time?.end && state.time?.start
      ? state.time.end - state.time.start
      : undefined,
    toolUseId: part.callID,
  };
}

/**
 * Extract subagent from task tool part with full metadata.summary parsing.
 * Returns the SubagentBlock and recursively parsed subagent blocks.
 */
export function extractSubagentFromTaskTool(
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
  const isComplete = state.status === 'completed' || state.status === 'error';

  // Parse the summary parts if available (contains subagent's conversation)
  if (state.metadata.summary && Array.isArray(state.metadata.summary)) {
    for (const summaryPart of state.metadata.summary) {
      const converted = partToBlocks(summaryPart, model, logger);
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
    status: isComplete ? 'complete' : 'pending' as BlockLifecycleStatus,
    output: typeof state.output === 'string' ? state.output : undefined,
    durationMs: state.time?.end && state.time?.start
      ? state.time.end - state.time.start
      : undefined,
    toolUseId: part.callID,
  };

  return { subagentBlock, subagentBlocks };
}

// ============================================================================
// Part to Blocks Conversion (for transcript loading)
// ============================================================================

/**
 * Convert a single part to ConversationBlocks.
 * Used for transcript loading - returns complete blocks.
 */
export function partToBlocks(part: Part, model: string | undefined, logger: Logger): ConversationBlock[] {
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
// Part to Events Conversion (for transcript loading via reducer)
// ============================================================================

/**
 * Convert a single part to SessionEvents for transcript loading.
 * Emits block:upsert events for finalized content (status: complete).
 */
export function partToEvents(
  part: Part,
  model: string | undefined,
  conversationId: string,
  logger: Logger
): AnySessionEvent[] {
  const events: AnySessionEvent[] = [];

  try {
    switch (part.type) {
      case 'text': {
        const block = convertTextPart(part as any, model);
        if (block) {
          events.push(createSessionEvent(
            'block:upsert',
            { block: { ...block, status: 'complete' as BlockLifecycleStatus } },
            { conversationId, source: 'runner' }
          ));
        }
        break;
      }

      case 'reasoning': {
        const block = convertReasoningPart(part as any);
        if (block) {
          events.push(createSessionEvent(
            'block:upsert',
            { block: { ...block, status: 'complete' as BlockLifecycleStatus } },
            { conversationId, source: 'runner' }
          ));
        }
        break;
      }

      case 'tool': {
        // Task tools are handled separately for subagent extraction
        if (isTaskTool(part)) {
          break;
        }
        // convertToolPart already sets status on blocks
        const blocks = convertToolPart(part as any);
        for (const block of blocks) {
          events.push(createSessionEvent(
            'block:upsert',
            { block },
            { conversationId, source: 'runner' }
          ));
        }
        break;
      }

      case 'agent': {
        // convertAgentPart already sets status: 'complete'
        const block = convertAgentPart(part as any);
        events.push(createSessionEvent(
          'block:upsert',
          { block },
          { conversationId, source: 'runner' }
        ));
        break;
      }

      case 'subtask': {
        // convertSubtaskPart already sets status: 'pending'
        const block = convertSubtaskPart(part as any);
        events.push(createSessionEvent(
          'block:upsert',
          { block },
          { conversationId, source: 'runner' }
        ));
        break;
      }

      // Skip step events - they're operational logs, not conversation content
      case 'step-start':
      case 'step-finish':
      case 'retry':
      // Skip these part types - not displayed in conversation
      case 'file':
      case 'snapshot':
      case 'patch':
      case 'compaction':
        break;

      default:
        logger.debug({ partType: (part as any).type }, 'Unknown OpenCode part type, skipping');
        break;
    }
  } catch (error) {
    logger.error({ error, part }, 'Failed to convert OpenCode part to events');
  }

  return events;
}

/**
 * Convert task tool to subagent events for transcript loading.
 * Emits subagent:spawned, nested block:upsert events, and subagent:completed.
 */
export function taskToolToEvents(
  part: Part & { type: 'tool' },
  model: string | undefined,
  logger: Logger
): AnySessionEvent[] {
  const events: AnySessionEvent[] = [];
  const extracted = extractSubagentFromTaskTool(part, model, logger);

  if (!extracted) {
    // Not a proper subagent, convert as regular tool
    // convertToolPart already sets status on blocks
    const blocks = convertToolPart(part);
    for (const block of blocks) {
      events.push(createSessionEvent(
        'block:upsert',
        { block },
        { conversationId: 'main', source: 'runner' }
      ));
    }
    return events;
  }

  const state = part.state as any;
  const subagentId = extracted.subagentBlock.subagentId!;

  // 1. Emit subagent:spawned (creates SubagentBlock and subagent entry in reducer)
  events.push(createSessionEvent(
    'subagent:spawned',
    {
      toolUseId: part.callID,
      prompt: state.input?.prompt || state.input?.description || '',
      subagentType: state.input?.subagent_type,
      description: state.input?.description,
    },
    { conversationId: 'main', source: 'runner' }
  ));

  // 2. Emit block:upsert for each nested block in subagent's conversation
  for (const block of extracted.subagentBlocks) {
    // Blocks from partToBlocks already have status set
    events.push(createSessionEvent(
      'block:upsert',
      { block },
      { conversationId: subagentId, source: 'runner' }
    ));
  }

  // 3. Emit subagent:completed with output and status
  events.push(createSessionEvent(
    'subagent:completed',
    {
      toolUseId: part.callID,
      agentId: subagentId,
      status: state.status === 'completed' ? 'completed' : 'failed',
      output: typeof state.output === 'string' ? state.output : undefined,
      durationMs: state.time?.end && state.time?.start
        ? state.time.end - state.time.start
        : undefined,
    },
    { conversationId: 'main', source: 'runner' }
  ));

  return events;
}
