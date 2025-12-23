/**
 * Claude SDK Event Converter
 *
 * Converts SDK messages (from streaming or transcripts) to SessionEvents.
 * Events are then processed by the shared reducer to build conversation state.
 *
 * Event mapping:
 * - Streaming: content_block_start → block:upsert (status: pending)
 * - Streaming: content_block_delta → block:delta (text accumulation)
 * - Transcript: user/assistant messages → block:upsert (status: complete)
 * - Task tool: subagent:spawned + subagent:completed
 *
 * Block lifecycle:
 * - Streaming blocks start with status: 'pending'
 * - Transcript blocks have status: 'complete'
 * - Block status tracks data finalization, NOT execution result
 * - Tool execution result is stored in ToolResultBlock.isError
 *
 * Main entry point: sdkMessageToEvents()
 */

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type {
  ConversationBlock,
  SkillLoadBlock,
  AnySessionEvent,
  BlockLifecycleStatus,
} from '@ai-systems/shared-types';
import { createSessionEvent } from '@ai-systems/shared-types';
import { generateId, noopLogger } from '../utils.js';
import type { ConvertOptions } from '../types.js';

// ============================================================================
// Subagent Prompt Tracking (Claude SDK-specific workaround)
// ============================================================================

/**
 * Track active Task tool prompts to filter out subagent prompt messages.
 *
 * WHY THIS IS NEEDED:
 * The Claude SDK has a quirk where subagent prompts appear as "user messages"
 * in the main transcript. When a Task tool is invoked:
 * 1. The assistant emits a tool_use block with the prompt
 * 2. The SDK internally creates a "user message" containing the same prompt
 *    to send to the subagent
 * 3. This user message appears in the main transcript stream
 *
 * Without filtering, the subagent's prompt would appear as if the human user
 * typed it, which is incorrect. We track Task prompts here so we can filter
 * them out when they appear as user messages.
 *
 * NOTE: This is module-scoped state, not truly stateless. This is acceptable
 * because:
 * - It's contained within this module
 * - It has proper cleanup (MAX_TASK_PROMPTS limit)
 * - It's necessary for correct Claude SDK transcript parsing
 * - The OpenCode SDK doesn't have this issue (different architecture)
 *
 * Key: Task tool's toolUseId
 * Value: The prompt string
 */
const activeTaskPrompts = new Map<string, string>();

/**
 * Maximum number of prompts to track to prevent memory leaks.
 * Old entries are removed (LRU eviction) when this limit is exceeded.
 */
const MAX_TASK_PROMPTS = 100;

/**
 * Register a Task tool's prompt for filtering.
 * Called when we detect a Task tool_use block.
 */
function registerTaskPrompt(toolUseId: string, prompt: string): void {
  // Clean up old entries if we have too many
  if (activeTaskPrompts.size >= MAX_TASK_PROMPTS) {
    // Remove the oldest entry (first key)
    const firstKey = activeTaskPrompts.keys().next().value;
    if (firstKey) {
      activeTaskPrompts.delete(firstKey);
    }
  }
  activeTaskPrompts.set(toolUseId, prompt);
}

/**
 * Check if a user message content is a subagent prompt that should be filtered.
 */
function isSubagentPrompt(content: string): boolean {
  // Check if this content matches any registered Task prompts
  for (const prompt of activeTaskPrompts.values()) {
    if (content === prompt || content.trim() === prompt.trim()) {
      return true;
    }
  }
  return false;
}

// ============================================================================
// Skill Detection Helpers
// ============================================================================

/**
 * Detect if a user message content is a skill injection.
 * Skills are loaded via "silent prompts" and have specific patterns in their content.
 */
function isSkillInjectionContent(content: string): boolean {
  // Check for patterns that indicate skill injection content
  return (
    content.startsWith('Base directory for this skill:') ||
    content.includes('\n# ') && content.includes('Skill') ||
    content.includes('Use `read_skill_file` with skill=')
  );
}

/**
 * Extract the skill name from skill injection content.
 * @param content - The full skill injection content
 * @returns The extracted skill name, or 'unknown' if not found
 */
function extractSkillName(content: string): string {
  // Try to extract from "Base directory for this skill: .../skills/{skillName}"
  const dirMatch = content.match(/skills\/([^\s\/\n]+)/);
  if (dirMatch?.[1]) {
    return dirMatch[1];
  }

  // Try to extract from "# {SkillName} Skill" header
  const headerMatch = content.match(/^#\s+(.+?)\s+Skill\b/m);
  if (headerMatch?.[1]) {
    return headerMatch[1].toLowerCase().replace(/\s+/g, '-');
  }

  return 'unknown';
}

/**
 * Create a SkillLoadBlock from skill injection content.
 */
function createSkillLoadBlock(content: string): SkillLoadBlock {
  return {
    type: 'skill_load',
    id: generateId(),
    timestamp: new Date().toISOString(),
    skillName: extractSkillName(content),
    content,
    status: 'complete' as BlockLifecycleStatus, // Skill load is always finalized
  };
}

/**
 * Get a human-readable log message for a system message
 */
function getSystemLogMessage(msg: Extract<SDKMessage, { type: 'system' }>): string {
  switch (msg.subtype) {
    case 'init':
      return `Session initialized with ${msg.model}`;
    case 'status':
      return `Status: ${msg.status || 'ready'}`;
    case 'hook_response':
      return `Hook ${msg.hook_name} (${msg.hook_event})`;
    case 'compact_boundary':
      return `Compact boundary (${msg.compact_metadata?.trigger || 'unknown'})`;
    default:
      return `System: ${(msg as any).subtype}`;
  }
}

/**
 * Convert an SDK message to SessionEvents.
 *
 * This is the main entry point for converting Claude SDK messages to events.
 * Works for both streaming events and finalized transcript messages.
 *
 * @param message - SDK message (from stream or transcript)
 * @param options - Optional configuration including logger
 * @returns Array of session events to be processed by the reducer
 */
export function sdkMessageToEvents(
  message: SDKMessage,
  options: ConvertOptions = {}
): AnySessionEvent[] {
  const event = message; // Alias for compatibility with existing code
  const logger = options.logger ?? noopLogger;

  // Handle system error messages from SDK executor
  if ((event as any).type === 'system' && (event as any).subtype === 'error') {
    logger.error({ event }, 'System error message from SDK executor');
    throw new Error((event as any).error?.message || 'Unknown SDK error');
  }

  // Determine which conversation this belongs to
  // Check parent_tool_use_id in multiple locations:
  // 1. On the outer event wrapper (for result/system events)
  // 2. On the inner event.event (for stream_event types from subagents)
  const outerParentId = (event as any).parent_tool_use_id;
  const innerParentId = event.type === 'stream_event' ? (event as any).event?.parent_tool_use_id : undefined;
  const conversationId: 'main' | string = outerParentId || innerParentId || 'main';

  // Handle streaming events (SDKPartialAssistantMessage)
  if (event.type === 'stream_event') {
    return parseRawStreamEvent(event.event, conversationId);
  }

  // Handle result messages (final metadata + log)
  if (event.type === 'result') {
    const isSuccess = event.subtype === 'success';

    // Emit result as log event
    const logEvent = createSessionEvent(
      'log',
      {
        level: isSuccess ? 'info' : 'error',
        message: isSuccess
          ? `Session completed (${event.num_turns} turns, $${event.total_cost_usd.toFixed(4)})`
          : `Session ended: ${event.subtype}`,
        data: {
          subtype: event.subtype,
          duration_ms: event.duration_ms,
          num_turns: event.num_turns,
          total_cost_usd: event.total_cost_usd,
        },
      },
      { source: 'runner' }
    );

    if (isSuccess) {
      const metadataEvent = createSessionEvent(
        'metadata:update',
        {
          metadata: {
            usage: {
              inputTokens: event.usage.input_tokens,
              outputTokens: event.usage.output_tokens,
              cacheReadTokens: event.usage.cache_read_input_tokens,
              cacheWriteTokens: event.usage.cache_creation_input_tokens,
              totalTokens: event.usage.input_tokens + event.usage.output_tokens,
            },
            costUSD: event.total_cost_usd,
          },
        },
        { conversationId, source: 'runner' }
      );
      return [metadataEvent, logEvent];
    }

    return [logEvent];
  }

  // Handle tool progress messages
  // Note: tool_progress indicates tool is running - we emit block:upsert with pending status
  // The full block data isn't available here, so we rely on previous block:upsert having created it
  // This is a limitation - ideally we'd have the full block. For now, emit a log event.
  if (event.type === 'tool_progress') {
    return [
      createSessionEvent(
        'log',
        {
          level: 'debug',
          message: `Tool ${event.tool_use_id} is running`,
          data: { toolUseId: event.tool_use_id, parentToolUseId: event.parent_tool_use_id },
        },
        { conversationId: event.parent_tool_use_id || 'main', source: 'runner' }
      ),
    ];
  }

  // Convert system messages (except error) to log events
  if (event.type === 'system') {
    return [
      createSessionEvent(
        'log',
        {
          level: 'info',
          message: getSystemLogMessage(event),
          data: {
            subtype: event.subtype,
            ...(event.subtype === 'init' && { model: event.model }),
            ...(event.subtype === 'status' && { status: event.status }),
            ...(event.subtype === 'hook_response' && {
              hook_name: event.hook_name,
              hook_event: event.hook_event,
              exit_code: event.exit_code,
            }),
            ...(event.subtype === 'compact_boundary' && { trigger: event.compact_metadata?.trigger }),
          },
        },
        { source: 'runner' }
      ),
    ];
  }

  // Convert auth_status to log event
  if (event.type === 'auth_status') {
    return [
      createSessionEvent(
        'log',
        {
          level: event.error ? 'error' : 'info',
          message: event.isAuthenticating ? 'Authenticating...' : (event.error ? `Auth error: ${event.error}` : 'Authentication complete'),
          data: {
            isAuthenticating: event.isAuthenticating,
            hasError: !!event.error,
          },
        },
        { source: 'runner' }
      ),
    ];
  }

  // EARLY INTERCEPT: Task tool completion
  // When Task tool_result arrives, emit subagent:completed instead of creating SubagentBlock
  // The reducer will update the existing SubagentBlock created on subagent:spawned
  if (event.type === 'user') {
    const toolUseResult = (event as any).tool_use_result;
    if (toolUseResult?.agentId) {
      // This is a Task completion - emit subagent:completed
      const content = (event as any).message?.content;
      const toolResultBlock = Array.isArray(content)
        ? content.find((b: any) => b.type === 'tool_result')
        : null;

      return [
        createSessionEvent(
          'subagent:completed',
          {
            toolUseId: toolResultBlock?.tool_use_id,
            agentId: toolUseResult.agentId,
            status: toolUseResult.status === 'completed' ? 'completed' : 'failed',
            output: extractTextFromToolResultContent(toolUseResult.content),
            durationMs: toolUseResult.totalDurationMs,
          },
          { conversationId: 'main', source: 'runner' }
        ),
      ];
    }
  }

  // For other message types (user, assistant, etc.)
  // Convert to blocks and emit block:upsert events with status: complete
  const blocks = messageToBlocks(event, options);
  return blocks.map((block) =>
    createSessionEvent(
      'block:upsert',
      { block: { ...block, status: 'complete' as BlockLifecycleStatus } },
      { conversationId, source: 'runner' }
    )
  );
}

/**
 * Convert an SDK message to ConversationBlocks
 * @internal Used by sdkMessageToEvents for block:complete events
 *
 * @param msg - SDK message from transcript or stream
 * @param options - Optional configuration including logger
 * @returns Array of ConversationBlocks
 */
function messageToBlocks(
  msg: SDKMessage,
  options: ConvertOptions = {}
): ConversationBlock[] {
  const logger = options.logger ?? noopLogger;

  try {
    switch (msg.type) {
      case 'user':
        return convertUserMessage(msg);

      case 'assistant':
        return convertAssistantMessage(msg);

      case 'system':
        // System messages are operational logs, not conversation content
        // During streaming: sdkMessageToEvents() converts them to LogEvent
        // During transcript load: skip them (were already logged originally)
        return [];

      case 'result':
        // Result messages are handled as LogEvent in sdkMessageToEvents
        // During transcript load: skip them
        return [];

      case 'tool_progress':
        // Tool progress is handled via block updates, not new blocks
        return [];

      case 'auth_status':
        // Auth status is handled as LogEvent in sdkMessageToEvents
        // During transcript load: skip them
        return [];

      case 'stream_event':
        // Streaming events are handled by sdkMessageToEvents, not here
        // This is for parsing stored transcripts
        return [];

      // @ts-ignore
      case 'queue-operation':
        // Internal SDK message for operation queuing - not user-visible
        logger.debug({ msg }, 'queue-operation message received');
        return [];

      default:
        logger.warn({ msgType: (msg as any).type, msg }, 'Unknown SDK message type');
        return [];
    }
  } catch (error) {
    logger.error({ error, msg }, 'Failed to convert SDK message to block');
    return [];
  }
}

/**
 * Convert SDK user message to blocks
 *
 * Handles two cases:
 * 1. Real user messages (content is string) → UserMessageBlock
 * 2. Tool results (content is array with tool_result blocks) → ToolResultBlock or SubagentBlock
 */
function convertUserMessage(msg: Extract<SDKMessage, { type: 'user' }>): ConversationBlock[] {
  const content = msg.message.content;

  // Tool result messages have content as array with tool_result blocks
  if (Array.isArray(content) && content.some((b: any) => b.type === 'tool_result')) {
    const blocks: ConversationBlock[] = [];

    for (const block of content) {
      if ((block as any).type === 'tool_result') {
        const toolResultBlock = block as any;
        // SDK uses snake_case: tool_use_result
        const toolUseResult = (msg as any).tool_use_result;

        if (toolUseResult?.agentId) {
          // Task tool result → SubagentBlock
          // Note: BlockLifecycleStatus ('complete') is separate from execution status
          // The subagent's execution result is indicated by the output/error content
          blocks.push({
            type: 'subagent',
            id: generateId(),
            timestamp: new Date().toISOString(),
            subagentId: toolUseResult.agentId, // SDK's agent ID (e.g., "abc123")
            name: toolUseResult.subagent_type,
            input: toolUseResult.prompt || '',
            status: 'complete' as BlockLifecycleStatus, // Block is finalized
            output: extractTextFromToolResultContent(toolUseResult.content),
            durationMs: toolUseResult.totalDurationMs,
            toolUseId: toolResultBlock.tool_use_id,
          });
        } else {
          // Regular tool result → ToolResultBlock
          blocks.push({
            type: 'tool_result',
            id: generateId(),
            timestamp: new Date().toISOString(),
            toolUseId: toolResultBlock.tool_use_id,
            output: toolResultBlock.content,
            isError: toolResultBlock.is_error || false,
            status: 'complete' as BlockLifecycleStatus, // Block is finalized
          });
        }
      }
    }

    return blocks;
  }

  // Real user message (content is string)
  const messageContent = extractUserMessageContent(msg.message);

  // Check if this is a subagent prompt that should be filtered
  if (isSubagentPrompt(messageContent)) {
    return []; // Filter out subagent prompts from main conversation
  }

  // Check if this is a skill injection message
  if (isSkillInjectionContent(messageContent)) {
    return [createSkillLoadBlock(messageContent)];
  }

  return [{
    type: 'user_message',
    id: msg.uuid || generateId(),
    timestamp: new Date().toISOString(),
    content: messageContent,
    status: 'complete' as BlockLifecycleStatus, // User message is always finalized
  }];
}

/**
 * Extract text content from tool result content array
 */
function extractTextFromToolResultContent(content: any): string | undefined {
  if (!content) return undefined;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n');
  }
  return undefined;
}

/**
 * Extract content from SDK APIUserMessage
 */
function extractUserMessageContent(message: any): string {
  // APIUserMessage.content can be string or ContentBlock[]
  if (typeof message.content === 'string') {
    return message.content;
  }

  // If array, concatenate text blocks
  if (Array.isArray(message.content)) {
    return message.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('\n');
  }

  return '';
}

/**
 * Convert SDK assistant message to blocks (text, tool use, thinking)
 */
function convertAssistantMessage(msg: Extract<SDKMessage, { type: 'assistant' }>): ConversationBlock[] {
  const blocks: ConversationBlock[] = [];
  const apiMessage = msg.message;

  // APIAssistantMessage.content is ContentBlock[]
  for (const contentBlock of apiMessage.content) {
    switch (contentBlock.type) {
      case 'text':
        blocks.push({
          type: 'assistant_text',
          id: contentBlock.id || generateId(),
          timestamp: new Date().toISOString(),
          content: contentBlock.text,
          model: apiMessage.model,
          status: 'complete' as BlockLifecycleStatus, // In transcript, block is finalized
        });
        break;

      case 'tool_use':
        // Register Task prompts for filtering
        if (contentBlock.name === 'Task') {
          const prompt = (contentBlock.input as Record<string, unknown>)?.prompt;
          if (typeof prompt === 'string') {
            registerTaskPrompt(contentBlock.id, prompt);
          }
        }

        // In transcript, tool_use block is already finalized (status: complete)
        // Note: BlockLifecycleStatus tracks data finalization, not execution result
        // The actual tool execution result is in the corresponding ToolResultBlock
        const toolUseId = contentBlock.id || generateId();
        blocks.push({
          type: 'tool_use',
          id: toolUseId,
          timestamp: new Date().toISOString(),
          toolName: contentBlock.name,
          toolUseId: toolUseId,
          input: contentBlock.input as Record<string, unknown>,
          status: 'complete' as BlockLifecycleStatus,
        });
        break;

      case 'thinking':
        blocks.push({
          type: 'thinking',
          id: contentBlock.id || generateId(),
          timestamp: new Date().toISOString(),
          content: (contentBlock as any).thinking || '',
          status: 'complete' as BlockLifecycleStatus, // In transcript, block is finalized
        });
        break;

      default:
        // Skip unknown block types
        break;
    }
  }

  return blocks;
}

/**
 * Parse Anthropic SDK RawMessageStreamEvent to SessionEvent(s)
 * Returns an array because some events (like Task tool start) generate multiple session events.
 */
function parseRawStreamEvent(rawEvent: any, conversationId: 'main' | string): AnySessionEvent[] {
  switch (rawEvent.type) {
    case 'content_block_start': {
      const block = rawEvent.content_block;

      // Create appropriate block based on content type
      // All streaming blocks start with status: 'pending' and will be finalized later
      if (block.type === 'text') {
        return [createSessionEvent(
          'block:upsert',
          {
            block: {
              type: 'assistant_text',
              id: block.id || generateId(),
              timestamp: new Date().toISOString(),
              content: block.text || '',
              status: 'pending' as BlockLifecycleStatus,
            },
          },
          { conversationId, source: 'runner' }
        )];
      } else if (block.type === 'tool_use') {
        const events: AnySessionEvent[] = [];

        // If this is a Task tool, emit subagent:spawned first
        // This creates the SubagentBlock and subagent entry before its blocks arrive
        if (block.name === 'Task') {
          const prompt = block.input?.prompt;
          events.push(createSessionEvent(
            'subagent:spawned',
            {
              toolUseId: block.id,
              prompt: typeof prompt === 'string' ? prompt : '',
              subagentType: block.input?.subagent_type as string | undefined,
              description: block.input?.description as string | undefined,
            },
            { conversationId, source: 'runner' }
          ));

          // Register the Task prompt for filtering
          // The prompt will be sent as a user message to the subagent,
          // and we need to filter it out from the main conversation
          if (typeof prompt === 'string') {
            registerTaskPrompt(block.id, prompt);
          }
        }

        // Emit the tool_use block:upsert event with pending status
        const toolUseId = block.id || generateId();
        events.push(createSessionEvent(
          'block:upsert',
          {
            block: {
              type: 'tool_use',
              id: toolUseId,
              timestamp: new Date().toISOString(),
              toolName: block.name,
              toolUseId: toolUseId,
              input: block.input || {},
              status: 'pending' as BlockLifecycleStatus,
            },
          },
          { conversationId, source: 'runner' }
        ));

        return events;
      } else if (block.type === 'thinking') {
        return [createSessionEvent(
          'block:upsert',
          {
            block: {
              type: 'thinking',
              id: block.id || generateId(),
              timestamp: new Date().toISOString(),
              content: '',
              status: 'pending' as BlockLifecycleStatus,
            },
          },
          { conversationId, source: 'runner' }
        )];
      }
      return [];
    }

    case 'content_block_delta': {
      const delta = rawEvent.delta;

      if (delta.type === 'text_delta') {
        return [createSessionEvent(
          'block:delta',
          {
            blockId: '', // Will be set by the caller based on index
            delta: delta.text,
          },
          { conversationId, source: 'runner' }
        )];
      } else if (delta.type === 'input_json_delta') {
        // Tool input is being streamed
        // We don't emit deltas for tool input, just wait for complete
        return [];
      } else if (delta.type === 'thinking_delta') {
        return [createSessionEvent(
          'block:delta',
          {
            blockId: '', // Will be set by the caller based on index
            delta: (delta as any).thinking || '',
          },
          { conversationId, source: 'runner' }
        )];
      }
      return [];
    }

    case 'content_block_stop': {
      // Block is complete - but we need the full block data
      // This is handled by tracking blocks in the session
      return []; // Will emit block_complete when we have full data
    }

    case 'message_start': {
      // Message starting - no action needed
      return [];
    }

    case 'message_delta': {
      // Message metadata update (usage, stop_reason, etc.)
      const usage = rawEvent.usage;
      if (usage) {
        return [createSessionEvent(
          'metadata:update',
          {
            metadata: {
              usage: {
                inputTokens: usage.input_tokens || 0,
                outputTokens: usage.output_tokens || 0,
                totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
              },
            },
          },
          { conversationId, source: 'runner' }
        )];
      }
      return [];
    }

    case 'message_stop': {
      // Message complete - final event
      return [];
    }

    default:
      return [];
  }
}

