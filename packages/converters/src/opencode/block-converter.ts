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

import type { Event, Part, 
  EventMessagePartUpdated, 
  EventMessageUpdated
 } from "@opencode-ai/sdk/v2";
import type {
  ConversationBlock,
  AnySessionEvent,
  BlockLifecycleStatus,
} from '@ai-systems/shared-types';
import { createSessionEvent } from '@ai-systems/shared-types';
import { toISOTimestamp, noopLogger } from '../utils.js';
import type { ConvertOptions } from '../types.js';
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
  options: ConvertOptions = {}
): OpenCodeEventConverter {
  const logger = options.logger ?? noopLogger;

  // Internal state
  const state: ConverterState = {
    messageRoles: new Map(),
    seenParts: new Set(),
  };

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
    part: Part & { type: 'text' },
    delta: string | undefined,
    conversationId: string,
    role: 'user' | 'assistant' | undefined
  ): AnySessionEvent[] {
    const partData = part as any;

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
              content: partData.text || '',
              status: 'complete' as BlockLifecycleStatus,
              timestamp: getPartTimestamp(part),
            },
          },
          { conversationId, source: 'runner' }
        ),
      ];
    }

    // Assistant text - stream with deltas
    if (!state.seenParts.has(part.id)) {
      // First time seeing this part
      state.seenParts.add(part.id);

      const events: AnySessionEvent[] = [
        createSessionEvent(
          'block:upsert',
          {
            block: {
              type: 'assistant_text',
              id: part.id,
              content: '', // Start empty, content comes via deltas
              status: 'pending' as BlockLifecycleStatus,
              timestamp: getPartTimestamp(part),
            },
          },
          { conversationId, source: 'runner' }
        ),
      ];

      // Emit initial delta
      if (delta) {
        events.push(
          createSessionEvent(
            'block:delta',
            { blockId: part.id, delta },
            { conversationId, source: 'runner' }
          )
        );
      }

      return events;
    }

    // Subsequent updates - delta only
    if (delta) {
      return [
        createSessionEvent(
          'block:delta',
          { blockId: part.id, delta },
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
    part: Part & { type: 'reasoning' },
    delta: string | undefined,
    conversationId: string
  ): AnySessionEvent[] {
    if (!state.seenParts.has(part.id)) {
      // First time seeing this part
      state.seenParts.add(part.id);

      const events: AnySessionEvent[] = [
        createSessionEvent(
          'block:upsert',
          {
            block: {
              type: 'thinking',
              id: part.id,
              content: '', // Start empty, content comes via deltas
              status: 'pending' as BlockLifecycleStatus,
              timestamp: getPartTimestamp(part),
            },
          },
          { conversationId, source: 'runner' }
        ),
      ];

      // Emit initial delta
      if (delta) {
        events.push(
          createSessionEvent(
            'block:delta',
            { blockId: part.id, delta },
            { conversationId, source: 'runner' }
          )
        );
      }

      return events;
    }

    // Subsequent updates - delta only
    if (delta) {
      return [
        createSessionEvent(
          'block:delta',
          { blockId: part.id, delta },
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
    part: Part & { type: 'tool' },
    conversationId: string
  ): AnySessionEvent[] {
    const partState = part.state as any;
    const isComplete = partState.status === 'completed' || partState.status === 'error';
    const events: AnySessionEvent[] = [];

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
            input: partState.input || {},
            status: mapToBlockStatus(partState.status),
            timestamp: partState.time?.start ? toISOTimestamp(partState.time.start) : new Date().toISOString(),
            displayName: partState.title,
          },
        },
        { conversationId, source: 'runner' }
      )
    );

    // Emit tool_result when complete
    if (isComplete) {
      events.push(
        createSessionEvent(
          'block:upsert',
          {
            block: {
              type: 'tool_result',
              id: `result-${part.id}`,
              toolUseId: part.callID,
              output: partState.status === 'error' ? partState.error : partState.output,
              isError: partState.status === 'error',
              status: 'complete' as BlockLifecycleStatus,
              timestamp: partState.time?.end ? toISOTimestamp(partState.time.end) : new Date().toISOString(),
              durationMs: partState.time?.end && partState.time?.start
                ? partState.time.end - partState.time.start
                : undefined,
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
    part: Part & { type: 'tool' },
    conversationId: string
  ): AnySessionEvent[] {
    const partState = part.state as any;
    const toolUseId = part.callID;
    const events: AnySessionEvent[] = [];

    // Emit subagent:spawned
    events.push(
      createSessionEvent(
        'subagent:spawned',
        {
          toolUseId,
          agentId: partState.metadata?.sessionId,
          prompt: partState?.input?.prompt || partState?.input?.description || '',
          subagentType: partState?.input?.subagent_type,
          description: partState?.input?.description,
        },
        { conversationId, source: 'runner' }
      )
    );

    // Check if subagent completed - emit subagent:completed
    if (partState.status === 'completed' || partState.status === 'error') {
      events.push(
        createSessionEvent(
          'subagent:completed',
          {
            toolUseId,
            agentId: partState.metadata?.sessionId,
            status: partState.status === 'completed' ? 'completed' : 'failed',
            output: typeof partState.output === 'string' ? partState.output : undefined,
            durationMs: partState.time?.end && partState.time?.start
              ? partState.time.end - partState.time.start
              : undefined,
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
  function handleLogPart(part: Part): AnySessionEvent[] {
    const partData = part as any;

    return [
      createSessionEvent(
        'log',
        {
          level: part.type === 'retry' ? 'warn' : 'info',
          message: part.type === 'step-start' ? 'Step started'
                 : part.type === 'step-finish' ? `Step finished: ${partData.reason || 'unknown'}`
                 : `Retry attempt ${partData.attempt || '?'}: ${partData.error?.message || 'Unknown error'}`,
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
  function handlePartUpdated(event: Event): AnySessionEvent[] {
    const { part, delta } = (event as any).properties;
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
        logger.debug({ partType: part.type }, 'Unknown OpenCode part type, skipping');
        return [];
    }
  }

  /**
   * Handle session.idle event
   */
  function handleSessionIdle(event: Event): AnySessionEvent[] {
    const { sessionID } = (event as any).properties;
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
  function handleSessionError(event: Event): AnySessionEvent[] {
    const e = event as any;
    return [
      createSessionEvent(
        'error',
        {
          message: e.properties?.message || 'Session error',
          data: e.properties,
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
