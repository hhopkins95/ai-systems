/**
 * Block Converter - Convert OpenCode SDK events to SessionEvents
 *
 * Transforms OpenCode SDK events (from SSE streaming) into architecture-agnostic
 * SessionEvent structures for real-time UI updates.
 *
 * Main entry point: opencodeEventToSessionEvents() (stateful per-session)
 */

import type { Event, Part, EventMessagePartUpdated, EventMessageUpdated, EventSessionIdle } from "@opencode-ai/sdk/v2";
import type {
  ConversationBlock,
  AnySessionEvent,
} from '@ai-systems/shared-types';
import { createSessionEvent } from '@ai-systems/shared-types';
import { generateId, toISOTimestamp, noopLogger } from '../utils.js';
import type { ConvertOptions } from '../types.js';
import {
  mapToolStatus,
  getPartTimestamp,
  isTaskTool,
  extractSubagentBlock,
} from './shared-helpers.js';

// ============================================================================
// Part to Block Converters (for streaming - may have empty content)
// ============================================================================

/**
 * Convert a Part to an incomplete block (for block:start events)
 * Text and reasoning parts start with empty content that gets filled via deltas
 */
function partToIncompleteBlock(part: Part, model?: string): ConversationBlock | null {
  try {
    switch (part.type) {
      case 'text':
        return {
          type: 'assistant_text',
          id: part.id,
          timestamp: getPartTimestamp(part),
          content: '', // Empty, will be filled via deltas
          model,
        };

      case 'reasoning':
        return {
          type: 'thinking',
          id: part.id,
          timestamp: getPartTimestamp(part),
          content: '', // Empty, will be filled via deltas
        };

      case 'tool': {
        const state = part.state as any;
        return {
          type: 'tool_use',
          id: part.id,
          timestamp: state.time?.start ? toISOTimestamp(state.time.start) : new Date().toISOString(),
          toolName: part.tool,
          toolUseId: part.callID,
          input: state.input || {},
          status: 'pending', // Always starts as pending
          displayName: state.title,
        };
      }

      case 'agent': {
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

      case 'subtask': {
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

      // Step events are handled as log events, not blocks
      case 'step-start':
      case 'step-finish':
      case 'retry':
        return null;

      // Skip these part types
      case 'file':
      case 'snapshot':
      case 'patch':
      case 'compaction':
        return null;

      default:
        return null;
    }
  } catch (error) {
    return null;
  }
}

// ============================================================================
// Stream Event Parser (Stateful)
// ============================================================================

/**
 * State for tracking active blocks during streaming.
 * Tracks blocks that have received block:start and need block:complete on session end.
 */
interface ActiveBlockState {
  block: ConversationBlock;
  conversationId: string;
  accumulatedContent: string; // For text/reasoning blocks
}

/**
 * Create a new session event parser instance.
 *
 * This maintains minimal state per session for proper block lifecycle:
 * - Tracks active text/reasoning blocks for content accumulation
 * - Emits block:complete on session.idle with accumulated content
 *
 * @param mainSessionId - The main session ID for conversation routing
 * @param options - Optional configuration including logger
 */
export function createStreamEventParser(mainSessionId: string, options: ConvertOptions = {}) {
  const logger = options.logger ?? noopLogger;
  const activeBlocks = new Map<string, ActiveBlockState>();

  /**
   * Parse a message.part.updated event
   */
  function parsePartUpdatedEvent(event: EventMessagePartUpdated): AnySessionEvent[] {
    const { part, delta } = event.properties;
    const conversationId = part.sessionID === mainSessionId ? 'main' : part.sessionID;
    const events: AnySessionEvent[] = [];

    // Convert step/retry events to log events instead of ConversationBlock
    if (part.type === 'step-start' || part.type === 'step-finish' || part.type === 'retry') {
      const p = part as any;
      return [
        createSessionEvent(
          'log',
          {
            level: part.type === 'retry' ? 'warn' : 'info',
            message: part.type === 'step-start' ? 'Step started'
                   : part.type === 'step-finish' ? `Step finished: ${p.reason || 'unknown'}`
                   : `Retry attempt ${p.attempt || '?'}: ${p.error?.message || 'Unknown error'}`,
            data: {
              partType: part.type,
              partId: part.id,
              ...(part.type === 'step-finish' && { reason: p.reason, cost: p.cost, tokens: p.tokens }),
              ...(part.type === 'retry' && { attempt: p.attempt, error: p.error }),
            },
          },
          { source: 'runner' }
        ),
      ];
    }

    // Check if this is a new block or an update to existing
    const isNewBlock = !activeBlocks.has(part.id);

    if (isNewBlock) {
      // Complete any active text/reasoning blocks before starting new one
      for (const [blockId, state] of activeBlocks) {
        if (state.block.type === 'assistant_text' || state.block.type === 'thinking') {
          logger.debug({
            action: 'completing_block',
            blockId,
            blockType: state.block.type,
            contentLength: state.accumulatedContent.length,
          }, 'Completing text/reasoning block on new block arrival');
          events.push(
            createSessionEvent(
              'block:complete',
              {
                blockId,
                block: {
                  ...state.block,
                  content: state.accumulatedContent,
                } as ConversationBlock,
              },
              { conversationId: state.conversationId, source: 'runner' }
            )
          );
          activeBlocks.delete(blockId);
        }
      }

      // Handle task tools specially for subagent blocks
      if (isTaskTool(part)) {
        const subagentBlock = extractSubagentBlock(part as any);
        if (subagentBlock) {
          activeBlocks.set(part.id, {
            block: subagentBlock,
            conversationId,
            accumulatedContent: '',
          });

          // Emit subagent:spawned event
          const state = (part as any).state;
          events.push(
            createSessionEvent(
              'subagent:spawned',
              {
                toolUseId: (part as any).callID,
                prompt: state?.input?.prompt || state?.input?.description || '',
                subagentType: state?.input?.subagent_type,
                description: state?.input?.description,
              },
              { conversationId: 'main', source: 'runner' }
            )
          );
          return events;
        }
      }

      // Emit block:start immediately for new blocks
      const incompleteBlock = partToIncompleteBlock(part);
      if (incompleteBlock) {
        logger.debug({
          action: 'block_start',
          blockId: part.id,
          blockType: incompleteBlock.type,
          partType: part.type,
        }, 'Starting new block');

        activeBlocks.set(part.id, {
          block: incompleteBlock,
          conversationId,
          accumulatedContent: '',
        });

        events.push(
          createSessionEvent(
            'block:start',
            { block: incompleteBlock },
            { conversationId, source: 'runner' }
          )
        );
      }
    }

    // Handle text delta for streaming content
    if (delta && (part.type === 'text' || part.type === 'reasoning')) {
      const activeState = activeBlocks.get(part.id);
      if (activeState) {
        activeState.accumulatedContent += delta;
        logger.debug({
          action: 'block_delta',
          blockId: part.id,
          deltaLength: delta.length,
          totalAccumulated: activeState.accumulatedContent.length,
        }, 'Received block delta');
      }

      events.push(
        createSessionEvent(
          'block:delta',
          { blockId: part.id, delta },
          { conversationId, source: 'runner' }
        )
      );
    }

    // Handle tool state updates
    if (part.type === 'tool') {
      const state = part.state as any;
      const status = mapToolStatus(state.status);

      events.push(
        createSessionEvent(
          'block:update',
          {
            blockId: part.id,
            updates: {
              status,
              displayName: state.title,
            } as Partial<ConversationBlock>,
          },
          { conversationId, source: 'runner' }
        )
      );

      // If tool is completed or errored, emit block:complete and tool_result
      if (state.status === 'completed' || state.status === 'error') {
        activeBlocks.delete(part.id);

        logger.debug({
          toolName: part.tool,
          hasOutput: !!state.output,
          status: state.status,
        }, 'Tool completed');

        // Check if this is a task tool (subagent completion)
        if (isTaskTool(part) && state.metadata?.sessionId) {
          events.push(
            createSessionEvent(
              'subagent:completed',
              {
                toolUseId: part.callID,
                agentId: state.metadata.sessionId,
                status: state.status === 'completed' ? 'completed' : 'failed',
                output: typeof state.output === 'string' ? state.output : undefined,
                durationMs: state.time?.end && state.time?.start
                  ? state.time.end - state.time.start
                  : undefined,
              },
              { conversationId: 'main', source: 'runner' }
            )
          );
        } else {
          // Regular tool - emit block:complete for tool_use
          const toolUseBlock: ConversationBlock = {
            type: 'tool_use',
            id: part.id,
            timestamp: state.time?.start ? toISOTimestamp(state.time.start) : new Date().toISOString(),
            toolName: part.tool,
            toolUseId: part.callID,
            input: state.input || {},
            status: mapToolStatus(state.status),
            displayName: state.title,
          };

          events.push(
            createSessionEvent(
              'block:complete',
              { blockId: part.id, block: toolUseBlock },
              { conversationId, source: 'runner' }
            )
          );

          // Emit tool_result as block:complete
          const resultBlock: ConversationBlock = {
            type: 'tool_result',
            id: generateId(),
            timestamp: state.time?.end ? toISOTimestamp(state.time.end) : new Date().toISOString(),
            toolUseId: part.callID,
            output: state.status === 'error' ? state.error : state.output,
            isError: state.status === 'error',
            durationMs: state.time?.end && state.time?.start
              ? state.time.end - state.time.start
              : undefined,
          };

          events.push(
            createSessionEvent(
              'block:complete',
              { blockId: resultBlock.id, block: resultBlock },
              { conversationId, source: 'runner' }
            )
          );
        }
      }
    }

    return events;
  }

  /**
   * Parse a message.updated event for metadata updates
   */
  function parseMessageUpdatedEvent(event: EventMessageUpdated): AnySessionEvent[] {
    const { info } = event.properties;

    if (info.role !== 'assistant') {
      return [];
    }

    const assistantInfo = info as any;
    const conversationId = info.sessionID === mainSessionId ? 'main' : info.sessionID;

    if (!assistantInfo.tokens && assistantInfo.cost === undefined) {
      return [];
    }

    return [
      createSessionEvent(
        'metadata:update',
        {
          metadata: {
            usage: assistantInfo.tokens ? {
              inputTokens: assistantInfo.tokens.input || 0,
              outputTokens: assistantInfo.tokens.output || 0,
              thinkingTokens: assistantInfo.tokens.reasoning || 0,
              cacheReadTokens: assistantInfo.tokens.cache?.read || 0,
              cacheWriteTokens: assistantInfo.tokens.cache?.write || 0,
              totalTokens: (assistantInfo.tokens.input || 0) + (assistantInfo.tokens.output || 0),
            } : undefined,
            costUSD: assistantInfo.cost,
            model: assistantInfo.modelID,
          },
        },
        { conversationId, source: 'runner' }
      ),
    ];
  }

  /**
   * Parse a session.idle event (session completed)
   */
  function parseSessionIdleEvent(event: EventSessionIdle): AnySessionEvent[] {
    const { sessionID } = event.properties;
    const events: AnySessionEvent[] = [];

    // Complete all active text/reasoning blocks
    for (const [blockId, state] of activeBlocks) {
      if (state.block.type === 'assistant_text' || state.block.type === 'thinking') {
        events.push(
          createSessionEvent(
            'block:complete',
            {
              blockId,
              block: {
                ...state.block,
                content: state.accumulatedContent,
              } as ConversationBlock,
            },
            { conversationId: state.conversationId, source: 'runner' }
          )
        );
      }
    }

    activeBlocks.clear();

    events.push(
      createSessionEvent(
        'log',
        {
          message: 'Session completed',
          data: { sessionId: sessionID },
        },
        { source: 'runner' }
      )
    );

    return events;
  }

  /**
   * Parse an OpenCode SDK Event into SessionEvents
   */
  function parseEvent(event: Event): AnySessionEvent[] {
    try {
      switch (event.type) {
        case 'message.part.updated':
          return parsePartUpdatedEvent(event);

        case 'message.updated':
          return parseMessageUpdatedEvent(event);

        case 'session.idle':
          return parseSessionIdleEvent(event);

        case 'session.error': {
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

        // Events we don't need to convert to session events
        case 'message.removed':
        case 'message.part.removed':
        case 'session.created':
        case 'session.updated':
        case 'session.deleted':
        case 'session.status':
        case 'session.compacted':
        case 'session.diff':
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
   * Reset the block trackers
   */
  function reset(): void {
    activeBlocks.clear();
  }

  return {
    parseEvent,
    reset,
  };
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Convert an OpenCode SDK Event to SessionEvents.
 *
 * NOTE: This creates a new parser for each call, which means state is not
 * preserved between calls. For proper streaming, use createStreamEventParser()
 * to maintain a single parser instance per session.
 *
 * @param event - OpenCode SDK Event (from SSE stream)
 * @param mainSessionId - The main session ID for routing
 * @param options - Optional configuration including logger
 * @returns Array of session events to be processed by the reducer
 */
export function opencodeEventToSessionEvents(
  event: Event,
  mainSessionId: string,
  options: ConvertOptions = {}
): AnySessionEvent[] {
  const parser = createStreamEventParser(mainSessionId, options);
  return parser.parseEvent(event);
}

/**
 * @deprecated Use createStreamEventParser() for stateful parsing,
 * or opencodeEventToSessionEvents() for single-event conversion.
 */
export function parseOpencodeStreamEvent(
  event: Event,
  mainSessionId: string,
  options: ConvertOptions = {}
): AnySessionEvent[] {
  return opencodeEventToSessionEvents(event, mainSessionId, options);
}
