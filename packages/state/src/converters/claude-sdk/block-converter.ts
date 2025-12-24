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
 * Main entry point: createClaudeSdkEventConverter()
 */

import type {
  SDKMessage,
  SDKPartialAssistantMessage,
  SDKAssistantMessage,
  SDKUserMessage,
  SDKUserMessageReplay,
} from '@anthropic-ai/claude-agent-sdk';

/**
 * RawMessageStreamEvent type from Anthropic SDK.
 * Extracted from SDKPartialAssistantMessage['event'] since the SDK doesn't re-export it.
 */
type RawMessageStreamEvent = SDKPartialAssistantMessage['event'];
import type {
  ConversationBlock,
  SkillLoadBlock,
  AnySessionEvent,
  BlockLifecycleStatus,
  SessionConversationState,
} from '@ai-systems/shared-types';
import { createSessionEvent } from '@ai-systems/shared-types';
import { generateId, noopLogger } from '../../utils.js';
import type { ConvertOptions } from '../../types.js';

// ============================================================================
// Type Helpers for SDK Message Handling
// ============================================================================

/**
 * Messages that have parent_tool_use_id field.
 * This is used to route events to the correct conversation (main vs subagent).
 */
type MessageWithParentToolUseId =
  | SDKPartialAssistantMessage
  | SDKAssistantMessage
  | SDKUserMessage
  | SDKUserMessageReplay;

/**
 * Extract parent_tool_use_id from SDK messages that support it.
 */
function getParentToolUseId(event: SDKMessage): string | null {
  switch (event.type) {
    case 'stream_event':
    case 'assistant':
    case 'user':
      return (event as MessageWithParentToolUseId).parent_tool_use_id ?? null;
    case 'tool_progress':
      return event.parent_tool_use_id ?? null;
    default:
      return null;
  }
}

/**
 * Check if message is a system error (runtime error from SDK executor).
 * Note: This is not part of the typed SDK message union but can occur at runtime.
 */
function isSystemError(event: SDKMessage): event is SDKMessage & { error?: { message?: string } } {
  return event.type === 'system' && (event as { subtype?: string }).subtype === 'error';
}

/**
 * Type guard for text content blocks.
 */
type TextContentBlock = { type: 'text'; text: string };

function isTextContentBlock(block: unknown): block is TextContentBlock {
  return (
    typeof block === 'object' &&
    block !== null &&
    (block as { type?: string }).type === 'text' &&
    typeof (block as { text?: unknown }).text === 'string'
  );
}

/**
 * Type guard for tool_result content blocks.
 */
type ToolResultContentBlock = { type: 'tool_result'; tool_use_id: string; content?: unknown };

function isToolResultContentBlock(block: unknown): block is ToolResultContentBlock {
  return (
    typeof block === 'object' &&
    block !== null &&
    (block as { type?: string }).type === 'tool_result'
  );
}

/**
 * Thinking content block type (from Anthropic Beta API).
 * Used to extract thinking content from assistant messages.
 */
type ThinkingContentBlock = { type: 'thinking'; thinking: string; id?: string };

/**
 * Get thinking content from a content block that has been narrowed to type 'thinking'.
 */
function getThinkingContent(block: { type: 'thinking' }): string {
  return (block as ThinkingContentBlock).thinking || '';
}

/**
 * Thinking delta type (from Anthropic Beta API streaming).
 */
type ThinkingDelta = { type: 'thinking_delta'; thinking: string };

/**
 * Get thinking delta content from a delta event.
 */
function getThinkingDelta(delta: { type: 'thinking_delta' }): string {
  return (delta as ThinkingDelta).thinking || '';
}

/**
 * Task tool use result shape (from Claude Agent SDK).
 * This is set when a Task (subagent) completes execution.
 */
type TaskToolUseResult = {
  agentId: string;
  status: 'completed' | 'failed' | string;
  content?: unknown;
  totalDurationMs?: number;
};

/**
 * Check if a user message is a Task tool completion.
 * Handles both snake_case (streaming) and camelCase (transcript) formats.
 */
function isTaskCompletion(event: SDKUserMessage | SDKUserMessageReplay): boolean {
  // Check both snake_case (streaming: tool_use_result) and camelCase (transcript: toolUseResult)
  const msg = event as SDKUserMessage & { toolUseResult?: TaskToolUseResult };
  const result = (event.tool_use_result ?? msg.toolUseResult) as TaskToolUseResult | undefined;
  return result !== undefined && typeof result.agentId === 'string';
}

/**
 * Get the tool_use_result from a user message.
 * Handles both snake_case (streaming) and camelCase (transcript) formats.
 */
function getTaskToolUseResult(event: SDKUserMessage | SDKUserMessageReplay): TaskToolUseResult | undefined {
  // Check both snake_case (streaming: tool_use_result) and camelCase (transcript: toolUseResult)
  const msg = event as SDKUserMessage & { toolUseResult?: TaskToolUseResult };
  const result = (event.tool_use_result ?? msg.toolUseResult) as TaskToolUseResult | undefined;
  return result?.agentId ? result : undefined;
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

// ============================================================================
// Stateful Event Converter Factory
// ============================================================================

/**
 * Internal state for the Claude SDK event converter.
 * Tracks message context for deterministic block ID generation.
 */
interface ClaudeConverterState {
  /** Current message ID from message_start event */
  currentMessageId: string | null;
  /** Maps content block index → block ID for delta routing */
  blockIdsByIndex: Map<number, string>;
  /** Tracks seen block IDs to prevent duplicates */
  seenBlockIds: Set<string>;
  /** Tracks active Task prompts for filtering */
  taskPrompts: Map<string, string>;
}

/**
 * Stateful event converter for Claude SDK messages.
 *
 * Follows the same pattern as OpenCode's converter:
 * - Factory function returns object with methods
 * - State is captured in closure
 * - Supports resuming from initial state
 */
export interface ClaudeSdkEventConverter {
  /**
   * Convert an SDK message to session events.
   * @param message - SDK message to convert
   * @param targetConversationId - Optional override for conversationId (used for subagent transcripts)
   */
  parseEvent: (message: SDKMessage, targetConversationId?: string) => AnySessionEvent[];
  /** Reset state between turns (clears message context, keeps seenBlockIds) */
  reset: () => void;
}

/**
 * Create a stateful Claude SDK event converter.
 *
 * This factory creates a converter that tracks message context for:
 * - Deterministic block ID generation (messageId-index pattern)
 * - Delta routing via index → blockId mapping
 * - Duplicate block prevention
 *
 * @param initialConversationState - Optional prior state for resuming mid-session
 * @param options - Optional configuration including logger
 * @returns Converter object with parseEvent and reset methods
 *
 * @example
 * ```typescript
 * // Fresh start
 * const converter = createClaudeSdkEventConverter();
 *
 * // Resume from prior state
 * const converter = createClaudeSdkEventConverter(existingState);
 *
 * // Process events
 * for (const msg of sdkMessages) {
 *   const events = converter.parseEvent(msg);
 *   for (const event of events) {
 *     state = reduceSessionEvent(state, event);
 *   }
 * }
 * ```
 */
export function createClaudeSdkEventConverter(
  initialConversationState?: SessionConversationState,
  options: ConvertOptions = {}
): ClaudeSdkEventConverter {
  const logger = options.logger ?? noopLogger;

  // Internal state captured in closure
  const state: ClaudeConverterState = {
    currentMessageId: null,
    blockIdsByIndex: new Map(),
    seenBlockIds: new Set(),
    taskPrompts: new Map(),
  };

  // Pre-populate seenBlockIds from initial state (for resume)
  if (initialConversationState) {
    for (const block of initialConversationState.blocks) {
      state.seenBlockIds.add(block.id);
    }
    for (const subagent of initialConversationState.subagents) {
      for (const block of subagent.blocks) {
        state.seenBlockIds.add(block.id);
      }
    }
  }

  /**
   * Register a Task tool's prompt for filtering.
   * Uses instance state instead of module-level state.
   */
  function registerTaskPromptLocal(toolUseId: string, prompt: string): void {
    if (state.taskPrompts.size >= MAX_TASK_PROMPTS) {
      const firstKey = state.taskPrompts.keys().next().value;
      if (firstKey) {
        state.taskPrompts.delete(firstKey);
      }
    }
    state.taskPrompts.set(toolUseId, prompt);
  }

  /**
   * Check if content is a subagent prompt that should be filtered.
   * Uses instance state instead of module-level state.
   */
  function isSubagentPromptLocal(content: string): boolean {
    for (const prompt of state.taskPrompts.values()) {
      if (content === prompt || content.trim() === prompt.trim()) {
        return true;
      }
    }
    return false;
  }

  /**
   * Parse a raw stream event with state tracking for deterministic IDs.
   */
  function parseRawStreamEventStateful(
    rawEvent: RawMessageStreamEvent,
    conversationId: 'main' | string
  ): AnySessionEvent[] {
    switch (rawEvent.type) {
      case 'message_start': {
        // Capture message ID for subsequent block ID generation
        state.currentMessageId = rawEvent.message.id;
        state.blockIdsByIndex.clear();
        return [];
      }

      case 'content_block_start': {
        const block = rawEvent.content_block;
        const index = rawEvent.index;

        // Use SDK ID if available (tool_use), else derive from message ID
        const blockId = block.id || (state.currentMessageId ? `${state.currentMessageId}-${index}` : generateId());
        state.blockIdsByIndex.set(index, blockId);

        // Skip if already seen (resume scenario)
        if (state.seenBlockIds.has(blockId)) {
          return [];
        }
        state.seenBlockIds.add(blockId);

        // Create appropriate block based on content type
        if (block.type === 'text') {
          return [createSessionEvent(
            'block:upsert',
            {
              block: {
                type: 'assistant_text',
                id: blockId,
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
          if (block.name === 'Task') {
            const prompt = block.input?.prompt;
            events.push(createSessionEvent(
              'subagent:spawned',
              {
                toolUseId: blockId,
                prompt: typeof prompt === 'string' ? prompt : '',
                subagentType: block.input?.subagent_type as string | undefined,
                description: block.input?.description as string | undefined,
              },
              { conversationId, source: 'runner' }
            ));

            if (typeof prompt === 'string') {
              registerTaskPromptLocal(blockId, prompt);
            }
          }

          events.push(createSessionEvent(
            'block:upsert',
            {
              block: {
                type: 'tool_use',
                id: blockId,
                timestamp: new Date().toISOString(),
                toolName: block.name,
                toolUseId: blockId,
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
                id: blockId,
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
        const index = rawEvent.index;
        const blockId = state.blockIdsByIndex.get(index);

        if (!blockId) {
          logger.warn({ index }, 'Delta for unknown block index');
          return [];
        }

        const delta = rawEvent.delta;
        if (delta.type === 'text_delta') {
          return [createSessionEvent(
            'block:delta',
            { blockId, delta: delta.text },
            { conversationId, source: 'runner' }
          )];
        } else if (delta.type === 'input_json_delta') {
          // Tool input is being streamed - we don't emit deltas for this
          return [];
        } else if (delta.type === 'thinking_delta') {
          return [createSessionEvent(
            'block:delta',
            { blockId, delta: getThinkingDelta(delta) },
            { conversationId, source: 'runner' }
          )];
        }
        return [];
      }

      case 'content_block_stop': {
        return [];
      }

      case 'message_delta': {
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
        return [];
      }

      default:
        return [];
    }
  }

  /**
   * Convert assistant message blocks with deterministic IDs.
   * Uses message ID + index pattern for text/thinking blocks.
   */
  function convertAssistantMessageStateful(
    msg: SDKAssistantMessage,
    conversationId: string
  ): AnySessionEvent[] {
    const events: AnySessionEvent[] = [];
    const apiMessage = msg.message;
    const messageId = apiMessage.id;

    for (let i = 0; i < apiMessage.content.length; i++) {
      const contentBlock = apiMessage.content[i];

      // Generate deterministic block ID
      const blockId = contentBlock.id || (messageId ? `${messageId}-${i}` : generateId());

      // Always upsert to finalize - ensures complete content/status
      state.seenBlockIds.add(blockId);

      switch (contentBlock.type) {
        case 'text':
          events.push(createSessionEvent(
            'block:upsert',
            {
              block: {
                type: 'assistant_text',
                id: blockId,
                timestamp: new Date().toISOString(),
                content: contentBlock.text,
                model: apiMessage.model,
                status: 'complete' as BlockLifecycleStatus,
              },
            },
            { conversationId, source: 'runner' }
          ));
          break;

        case 'tool_use':
          // Register Task prompts for filtering
          if (contentBlock.name === 'Task') {
            const prompt = (contentBlock.input as Record<string, unknown>)?.prompt;
            if (typeof prompt === 'string') {
              registerTaskPromptLocal(blockId, prompt);
            }

            // Emit subagent:spawned for Task tool_use
            events.push(createSessionEvent(
              'subagent:spawned',
              {
                toolUseId: blockId,
                prompt: typeof prompt === 'string' ? prompt : '',
                subagentType: (contentBlock.input as Record<string, unknown>)?.subagent_type as string | undefined,
                description: (contentBlock.input as Record<string, unknown>)?.description as string | undefined,
              },
              { conversationId, source: 'runner' }
            ));
          }

          events.push(createSessionEvent(
            'block:upsert',
            {
              block: {
                type: 'tool_use',
                id: blockId,
                timestamp: new Date().toISOString(),
                toolName: contentBlock.name,
                toolUseId: blockId,
                input: contentBlock.input as Record<string, unknown>,
                status: 'complete' as BlockLifecycleStatus,
              },
            },
            { conversationId, source: 'runner' }
          ));
          break;

        case 'thinking':
          events.push(createSessionEvent(
            'block:upsert',
            {
              block: {
                type: 'thinking',
                id: blockId,
                timestamp: new Date().toISOString(),
                content: getThinkingContent(contentBlock),
                status: 'complete' as BlockLifecycleStatus,
              },
            },
            { conversationId, source: 'runner' }
          ));
          break;

        default:
          break;
      }
    }

    return events;
  }

  /**
   * Convert user message with local state tracking.
   */
  function convertUserMessageStateful(
    msg: Extract<SDKMessage, { type: 'user' }>,
    conversationId: string
  ): AnySessionEvent[] {
    const content = msg.message.content;

    // Tool result messages have content as array with tool_result blocks
    if (Array.isArray(content) && content.some(isToolResultContentBlock)) {
      const events: AnySessionEvent[] = [];
      const taskResult = getTaskToolUseResult(msg);

      for (const block of content) {
        if (isToolResultContentBlock(block)) {
          if (taskResult) {
            // Task tool completion - emit subagent:completed
            events.push(createSessionEvent(
              'subagent:completed',
              {
                toolUseId: block.tool_use_id,
                agentId: taskResult.agentId,
                status: taskResult.status === 'completed' ? 'completed' : 'failed',
                output: extractTextFromToolResultContent(taskResult.content),
                durationMs: taskResult.totalDurationMs,
              },
              { conversationId: 'main', source: 'runner' }
            ));
          } else {
            // Regular tool result
            const toolResultBlock = block as ToolResultContentBlock & { content?: unknown; is_error?: boolean };
            const blockId = generateId();
            state.seenBlockIds.add(blockId);

            events.push(createSessionEvent(
              'block:upsert',
              {
                block: {
                  type: 'tool_result',
                  id: blockId,
                  timestamp: new Date().toISOString(),
                  toolUseId: toolResultBlock.tool_use_id,
                  output: toolResultBlock.content,
                  isError: toolResultBlock.is_error || false,
                  status: 'complete' as BlockLifecycleStatus,
                },
              },
              { conversationId, source: 'runner' }
            ));
          }
        }
      }

      return events;
    }

    // Real user message (content is string)
    const messageContent = extractUserMessageContent(msg.message);

    // Check if this is a subagent prompt that should be filtered
    if (isSubagentPromptLocal(messageContent)) {
      return [];
    }

    // Check if this is a skill injection message
    if (isSkillInjectionContent(messageContent)) {
      const blockId = generateId();
      state.seenBlockIds.add(blockId);
      return [createSessionEvent(
        'block:upsert',
        {
          block: {
            ...createSkillLoadBlock(messageContent),
            id: blockId,
          },
        },
        { conversationId, source: 'runner' }
      )];
    }

    const blockId = msg.uuid || generateId();
    state.seenBlockIds.add(blockId);

    return [createSessionEvent(
      'block:upsert',
      {
        block: {
          type: 'user_message',
          id: blockId,
          timestamp: new Date().toISOString(),
          content: messageContent,
          status: 'complete' as BlockLifecycleStatus,
        },
      },
      { conversationId, source: 'runner' }
    )];
  }

  /**
   * Main parseEvent function - converts SDK message to session events.
   * @param message - SDK message to convert
   * @param targetConversationId - Optional override for conversationId (used for subagent transcripts)
   */
  function parseEvent(message: SDKMessage, targetConversationId?: string): AnySessionEvent[] {
    const event = message;

    // Handle system error messages from SDK executor
    if (isSystemError(event)) {
      logger.error({ event }, 'System error message from SDK executor');
      throw new Error(event.error?.message || 'Unknown SDK error');
    }

    // Determine which conversation this belongs to
    // Use targetConversationId if provided (for subagent transcripts), else derive from message
    const conversationId: 'main' | string = targetConversationId || getParentToolUseId(event) || 'main';

    // Handle streaming events with stateful tracking
    if (event.type === 'stream_event') {
      return parseRawStreamEventStateful(event.event, conversationId);
    }

    // Handle result messages
    if (event.type === 'result') {
      const isSuccess = event.subtype === 'success';

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

    // Convert system messages to log events
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
            message: event.isAuthenticating
              ? 'Authenticating...'
              : event.error
                ? `Auth error: ${event.error}`
                : 'Authentication complete',
            data: {
              isAuthenticating: event.isAuthenticating,
              hasError: !!event.error,
            },
          },
          { source: 'runner' }
        ),
      ];
    }

    // Handle user messages
    if (event.type === 'user') {
      return convertUserMessageStateful(event, conversationId);
    }

    // Handle assistant messages with stateful ID generation
    if (event.type === 'assistant') {
      return convertAssistantMessageStateful(event as SDKAssistantMessage, conversationId);
    }

    return [];
  }

  /**
   * Reset state between turns.
   * Clears message context but preserves seenBlockIds for session continuity.
   */
  function reset(): void {
    state.currentMessageId = null;
    state.blockIdsByIndex.clear();
    // Note: seenBlockIds and taskPrompts persist across turns
  }

  return { parseEvent, reset };
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
    default: {
      // Handle unknown subtypes that may appear at runtime
      const subtype = (msg as { subtype?: string }).subtype;
      return `System: ${subtype ?? 'unknown'}`;
    }
  }
}

// ============================================================================
// Constants and Helper Functions
// ============================================================================

/**
 * Maximum number of prompts to track to prevent memory leaks.
 * Old entries are removed (LRU eviction) when this limit is exceeded.
 */
const MAX_TASK_PROMPTS = 100;

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
