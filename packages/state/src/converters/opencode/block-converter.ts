/**
 * OpenCode Block Converter (Stateful)
 *
 * Converts OpenCode SDK events to SessionEvents using a stateful factory pattern.
 * Maintains state to:
 * - Correlate message roles with parts (messageId → role)
 * - Track seen parts for efficient delta-only updates
 *
 * Event mapping:
 * - message.updated → store role, emit metadata:update if tokens/cost present
 * - message.part.updated (text, user) → block:upsert for user_message (complete)
 * - message.part.updated (text, assistant) → block:upsert (first) + block:delta
 * - message.part.updated (tool) → block:upsert + tool_result when complete
 * - session.idle → session:idle, clear seenParts
 */

import type {
  Event,
  Part,
  EventMessagePartUpdated,
  EventMessageUpdated,
  EventSessionIdle,
  EventSessionError,
  TextPart,
  ReasoningPart,
  ToolPart,
  ToolState,
  StepStartPart,
  StepFinishPart,
  RetryPart,
} from "@opencode-ai/sdk/v2";
import type {
  ConversationBlock,
  AnySessionEvent,
  BlockLifecycleStatus,
  SessionConversationState,
} from '@ai-systems/shared-types';
import { createSessionEvent } from '@ai-systems/shared-types';
import { toISOTimestamp, noopLogger } from '../../utils.js';
import type { ConvertOptions } from '../../types.js';
import {
  mapToBlockStatus,
  getPartTimestamp,
  isTaskTool,
} from './shared-helpers.js';

// ============================================================================
// Types
// ============================================================================

export interface OpenCodeEventConverter {
  /**
   * Parse an OpenCode SDK event into SessionEvents
   */
  parseEvent(event: Event): AnySessionEvent[];

  /**
   * Reset converter state (call between sessions)
   */
  reset(): void;
}

interface ConverterState {
  /** message.updated → store role for part correlation */
  messageRoles: Map<string, 'user' | 'assistant'>;

  /** Track which parts we've created blocks for (for upsert vs delta) */
  seenParts: Set<string>;
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a stateful OpenCode event converter.
 *
 * The converter maintains internal state to:
 * 1. Correlate message roles with parts (user vs assistant)
 * 2. Track seen parts to emit block:upsert only once, then block:delta
 *
 * @param mainSessionId - The main session ID for routing (vs subagent sessions)
 * @param options - Optional configuration including logger
 * @returns Converter with parseEvent() and reset() methods
 */
export function createOpenCodeEventConverter(
  mainSessionId: string,
  initialConversationState? : SessionConversationState,
  options: ConvertOptions = {}
): OpenCodeEventConverter {
  const logger = options.logger ?? noopLogger;

  // Internal state
  const state: ConverterState = {
    messageRoles: new Map(),
    seenParts: new Set(),
  };

  // Pre-populate state from initial conversation (for mid-session resume)
  if (initialConversationState) {
    const processBlocks = (blocks: ConversationBlock[]) => {
      for (const block of blocks) {
        // Mark as seen to prevent duplicate upserts
        state.seenParts.add(block.id);

        // Extract messageId and infer role from block type
        const messageId = block.metadata?.opencodeMessageId as string | undefined;
        if (messageId) {
          const role = block.type === 'user_message' ? 'user' : 'assistant';
          state.messageRoles.set(messageId, role);
        }
      }
    };

    processBlocks(initialConversationState.blocks);
    for (const subagent of initialConversationState.subagents) {
      processBlocks(subagent.blocks);
    }
  }

  /**
   * Get the role for a message ID
   */
  function getMessageRole(messageId: string): 'user' | 'assistant' | undefined {
    return state.messageRoles.get(messageId);
  }

  /**
   * Handle message.updated event
   */
  function handleMessageUpdated(event: EventMessageUpdated): AnySessionEvent[] {
    const { info: messageInfo } = (event).properties;
    const conversationId = messageInfo.sessionID === mainSessionId ? 'main' : messageInfo.sessionID;


  

    // Always store the role for part correlation
    if (messageInfo.role === 'user' || messageInfo.role === 'assistant') {
      state.messageRoles.set(messageInfo.id, messageInfo.role);
    }

    // Emit metadata:update if tokens/cost present (assistant messages only)
    if (messageInfo.role === 'assistant' && (messageInfo.tokens || messageInfo.cost !== undefined)) {
      return [
        createSessionEvent(
          'metadata:update',
          {
            metadata: {
              usage: messageInfo.tokens ? {
                inputTokens: messageInfo.tokens.input || 0,
                outputTokens: messageInfo.tokens.output || 0,
                thinkingTokens: messageInfo.tokens.reasoning || 0,
                cacheReadTokens: messageInfo.tokens.cache?.read || 0,
                cacheWriteTokens: messageInfo.tokens.cache?.write || 0,
                totalTokens: (messageInfo.tokens.input || 0) + (messageInfo.tokens.output || 0),
              } : undefined,
              costUSD: messageInfo.cost,
              model: messageInfo.modelID,
            },
          },
          { conversationId, source: 'runner' }
        ),
      ];
    }

    return [];
  }

  /**
   * Handle text part (user or assistant)
   */
  function handleTextPart(
    part: TextPart,
    delta: string | undefined,
    conversationId: string,
    role: 'user' | 'assistant' | undefined
  ): AnySessionEvent[] {
    if (role === 'user') {
      // User text - emit as user_message, already complete
      // Only emit once (user messages don't stream)
      if (state.seenParts.has(part.id)) {
        return [];
      }
      state.seenParts.add(part.id);

      return [
        createSessionEvent(
          'block:upsert',
          {
            block: {
              type: 'user_message',
              id: part.id,
              content: part.text || '',
              status: 'complete' as BlockLifecycleStatus,
              timestamp: getPartTimestamp(part),
              metadata: { opencodeMessageId: part.messageID },
            },
          },
          { conversationId, source: 'runner' }
        ),
      ];
    }

    // Assistant text - stream with deltas
    // Only emit upsert when we have meaningful content (not just whitespace/newlines)
    const hasMeaningfulContent = delta?.trim();

    if (!state.seenParts.has(part.id)) {
      // First time seeing this part - only create block if we have real content
      if (!hasMeaningfulContent) {
        return []; // Skip until we have meaningful content
      }

      state.seenParts.add(part.id);

      return [
        createSessionEvent(
          'block:upsert',
          {
            block: {
              type: 'assistant_text',
              id: part.id,
              content: '', // Start empty, content comes via deltas
              status: 'pending' as BlockLifecycleStatus,
              timestamp: getPartTimestamp(part),
              metadata: { opencodeMessageId: part.messageID },
            },
          },
          { conversationId, source: 'runner' }
        ),
        createSessionEvent(
          'block:delta',
          { blockId: part.id, delta: delta! },
          { conversationId, source: 'runner' }
        ),
      ];
    }

    // Subsequent updates - delta only if meaningful
    if (hasMeaningfulContent) {
      return [
        createSessionEvent(
          'block:delta',
          { blockId: part.id, delta: delta! },
          { conversationId, source: 'runner' }
        ),
      ];
    }

    return [];
  }

  /**
   * Handle reasoning part
   */
  function handleReasoningPart(
    part: ReasoningPart,
    delta: string | undefined,
    conversationId: string
  ): AnySessionEvent[] {
    // Only emit upsert when we have meaningful content (not just whitespace/newlines)
    const hasMeaningfulContent = delta?.trim();

    if (!state.seenParts.has(part.id)) {
      // First time seeing this part - only create block if we have real content
      if (!hasMeaningfulContent) {
        return []; // Skip until we have meaningful content
      }

      state.seenParts.add(part.id);

      return [
        createSessionEvent(
          'block:upsert',
          {
            block: {
              type: 'thinking',
              id: part.id,
              content: '', // Start empty, content comes via deltas
              status: 'pending' as BlockLifecycleStatus,
              timestamp: getPartTimestamp(part),
              metadata: { opencodeMessageId: part.messageID },
            },
          },
          { conversationId, source: 'runner' }
        ),
        createSessionEvent(
          'block:delta',
          { blockId: part.id, delta: delta! },
          { conversationId, source: 'runner' }
        ),
      ];
    }

    // Subsequent updates - delta only if meaningful
    if (hasMeaningfulContent) {
      return [
        createSessionEvent(
          'block:delta',
          { blockId: part.id, delta: delta! },
          { conversationId, source: 'runner' }
        ),
      ];
    }

    return [];
  }

  /**
   * Handle tool part (regular tools, not task/subagent)
   */
  function handleToolPart(
    part: ToolPart,
    conversationId: string
  ): AnySessionEvent[] {
    const state: ToolState = part.state;
    const events: AnySessionEvent[] = [];

    // Get timestamp - running/completed/error states have time.start
    const timestamp = state.status !== 'pending' && state.time?.start
      ? toISOTimestamp(state.time.start)
      : new Date().toISOString();

    // Get display name - only running/completed have title
    const displayName = state.status === 'running' || state.status === 'completed'
      ? state.title
      : undefined;

    // Always emit tool_use upsert (status changes as tool progresses)
    events.push(
      createSessionEvent(
        'block:upsert',
        {
          block: {
            type: 'tool_use',
            id: part.id,
            toolName: part.tool,
            toolUseId: part.callID,
            input: state.input || {},
            status: mapToBlockStatus(state.status),
            timestamp,
            displayName,
            metadata: { opencodeMessageId: part.messageID },
          },
        },
        { conversationId, source: 'runner' }
      )
    );

    // Emit tool_result when complete
    if (state.status === 'completed') {
      events.push(
        createSessionEvent(
          'block:upsert',
          {
            block: {
              type: 'tool_result',
              id: `result-${part.id}`,
              toolUseId: part.callID,
              output: state.output,
              isError: false,
              status: 'complete' as BlockLifecycleStatus,
              timestamp: toISOTimestamp(state.time.end),
              durationMs: state.time.end - state.time.start,
            },
          },
          { conversationId, source: 'runner' }
        )
      );
    } else if (state.status === 'error') {
      events.push(
        createSessionEvent(
          'block:upsert',
          {
            block: {
              type: 'tool_result',
              id: `result-${part.id}`,
              toolUseId: part.callID,
              output: state.error,
              isError: true,
              status: 'complete' as BlockLifecycleStatus,
              timestamp: toISOTimestamp(state.time.end),
              durationMs: state.time.end - state.time.start,
            },
          },
          { conversationId, source: 'runner' }
        )
      );
    }

    return events;
  }

  /**
   * Handle task/subagent tool part
   */
  function handleSubagentPart(
    part: ToolPart,
    conversationId: string
  ): AnySessionEvent[] {
    const state: ToolState = part.state;
    const toolUseId = part.callID;
    const events: AnySessionEvent[] = [];

    // Extract input fields (input is always present on all ToolState variants)
    const input = state.input as Record<string, unknown>;
    const prompt = (input.prompt ?? input.description ?? '') as string;
    const subagentType = input.subagent_type as string | undefined;
    const description = input.description as string | undefined;

    // Get metadata (only on running/completed/error states)
    const metadata = state.status !== 'pending'
      ? (state.metadata as Record<string, unknown> | undefined)
      : undefined;
    const agentId = metadata?.sessionId as string | undefined;

    // Emit subagent:spawned
    events.push(
      createSessionEvent(
        'subagent:spawned',
        {
          toolUseId,
          agentId,
          prompt,
          subagentType,
          description,
        },
        { conversationId, source: 'runner' }
      )
    );

    // Check if subagent completed - emit subagent:completed
    if (state.status === 'completed') {
      events.push(
        createSessionEvent(
          'subagent:completed',
          {
            toolUseId,
            agentId: (state.metadata as Record<string, unknown>)?.sessionId as string | undefined,
            status: 'completed',
            output: state.output,
            durationMs: state.time.end - state.time.start,
          },
          { conversationId, source: 'runner' }
        )
      );
    } else if (state.status === 'error') {
      events.push(
        createSessionEvent(
          'subagent:completed',
          {
            toolUseId,
            agentId: (state.metadata as Record<string, unknown> | undefined)?.sessionId as string | undefined,
            status: 'failed',
            output: state.error,
            durationMs: state.time.end - state.time.start,
          },
          { conversationId, source: 'runner' }
        )
      );
    }

    return events;
  }

  /**
   * Handle step/retry log events
   */
  function handleLogPart(part: StepStartPart | StepFinishPart | RetryPart): AnySessionEvent[] {
    let message: string;
    let level: 'info' | 'warn' = 'info';

    switch (part.type) {
      case 'step-start':
        message = 'Step started';
        break;
      case 'step-finish':
        message = `Step finished: ${part.reason || 'unknown'}`;
        break;
      case 'retry':
        level = 'warn';
        message = `Retry attempt ${part.attempt}: ${part.error.data?.message || 'Unknown error'}`;
        break;
    }

    return [
      createSessionEvent(
        'log',
        {
          level,
          message,
          data: {
            partType: part.type,
            partId: part.id,
          },
        },
        { source: 'runner' }
      ),
    ];
  }

  /**
   * Handle message.part.updated event
   */
  function handlePartUpdated(event: EventMessagePartUpdated): AnySessionEvent[] {
    const { part, delta } = event.properties;
    const conversationId = part.sessionID === mainSessionId ? 'main' : part.sessionID;
    const role = getMessageRole(part.messageID);

    switch (part.type) {
      case 'text':
        return handleTextPart(part, delta, conversationId, role);

      case 'reasoning':
        return handleReasoningPart(part, delta, conversationId);

      case 'tool':
        if (isTaskTool(part)) {
          return handleSubagentPart(part, conversationId);
        }
        return handleToolPart(part, conversationId);

      case 'step-start':
      case 'step-finish':
      case 'retry':
        return handleLogPart(part);

      // Skip these part types (not displayed in conversation)
      case 'file':
      case 'snapshot':
      case 'patch':
      case 'compaction':
      case 'agent':
      case 'subtask':
        return [];

      default:
        logger.debug({ partType: (part as Part).type }, 'Unknown OpenCode part type, skipping');
        return [];
    }
  }

  /**
   * Handle session.idle event
   */
  function handleSessionIdle(event: EventSessionIdle): AnySessionEvent[] {
    const { sessionID } = event.properties;
    const conversationId = sessionID === mainSessionId ? 'main' : sessionID;

    // Clear seenParts for next turn (messages persist across turns)
    state.seenParts.clear();

    return [
      createSessionEvent(
        'session:idle',
        { sessionId: sessionID },
        { conversationId, source: 'runner' }
      ),
    ];
  }

  /**
   * Handle session.error event
   */
  function handleSessionError(event: EventSessionError): AnySessionEvent[] {
    const { sessionID, error } = event.properties;
    // Extract error message from the error union type (message is in data.message)
    const errorMessage = error?.data?.message;
    const message = typeof errorMessage === 'string' ? errorMessage : 'Session error';

    return [
      createSessionEvent(
        'error',
        {
          message,
          data: { sessionID, error },
        },
        { source: 'runner' }
      ),
    ];
  }

  /**
   * Parse an OpenCode SDK event into SessionEvents
   */
  function parseEvent(event: Event): AnySessionEvent[] {
    try {
      switch (event.type) {
        case 'message.updated':
          return handleMessageUpdated(event);

        case 'message.part.updated':
          return handlePartUpdated(event);

        case 'session.idle':
          return handleSessionIdle(event);

        case 'session.error':
          return handleSessionError(event);

        // Events we don't need to convert
        case 'session.created':
        case 'session.updated':
        case 'session.deleted':
        case 'session.status':
        case 'session.compacted':
        case 'session.diff':
        case 'message.removed':
        case 'message.part.removed':
        case 'file.edited':
        case 'file.watcher.updated':
        case 'vcs.branch.updated':
        case 'installation.updated':
        case 'installation.update-available':
        case 'lsp.client.diagnostics':
        case 'lsp.updated':
        case 'permission.updated':
        case 'permission.replied':
        case 'todo.updated':
        case 'command.executed':
        case 'tui.prompt.append':
        case 'tui.command.execute':
        case 'tui.toast.show':
        case 'server.connected':
          return [];

        default:
          logger.debug({ eventType: (event as any).type }, 'Unknown OpenCode event type');
          return [];
      }
    } catch (error) {
      logger.error({ error, event }, 'Failed to parse OpenCode session event');
      return [];
    }
  }

  /**
   * Reset converter state (call between sessions)
   */
  function reset(): void {
    state.messageRoles.clear();
    state.seenParts.clear();
  }

  return {
    parseEvent,
    reset,
  };
}
