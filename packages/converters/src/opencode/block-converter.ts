/**
 * Block Converter - Convert OpenCode SDK events to SessionEvents
 *
 * Transforms OpenCode SDK events (from SSE streaming) into architecture-agnostic
 * SessionEvent structures for real-time UI updates.
 */

import type { Event, Part, EventMessagePartUpdated, EventMessageUpdated, EventSessionIdle } from "@opencode-ai/sdk/v2";
import type {
  ConversationBlock,
  SubagentBlock,
  ToolExecutionStatus,
  AnySessionEvent,
} from '@ai-systems/shared-types';
import { createSessionEvent } from '@ai-systems/shared-types';
import { generateId, toISOTimestamp, noopLogger } from '../utils.js';
import type { ConvertOptions } from '../types.js';
import { mapToolStatus, getPartTimestamp } from './transcript-parser.js';

// ============================================================================
// Part to Block Converters
// ============================================================================

/**
 * Convert a Part to its corresponding ConversationBlock
 */
function partToBlock(part: Part, model?: string): ConversationBlock | null {
  try {
    switch (part.type) {
      case 'text':
        return {
          type: 'assistant_text',
          id: part.id,
          timestamp: getPartTimestamp(part),
          content: part.text,
          model,
        };

      case 'reasoning':
        return {
          type: 'thinking',
          id: part.id,
          timestamp: getPartTimestamp(part),
          content: part.text,
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
          status: mapToolStatus(state.status),
          displayName: state.title,
        };
      }

      case 'step-start':
        return {
          type: 'system',
          id: part.id,
          timestamp: new Date().toISOString(),
          subtype: 'status',
          message: 'Step started',
          metadata: {
            snapshot: (part as any).snapshot,
          },
        };

      case 'step-finish': {
        const p = part as any;
        return {
          type: 'system',
          id: part.id,
          timestamp: new Date().toISOString(),
          subtype: 'status',
          message: `Step finished: ${p.reason}`,
          metadata: {
            reason: p.reason,
            snapshot: p.snapshot,
            cost: p.cost,
            tokens: p.tokens,
          },
        };
      }

      case 'retry': {
        const p = part as any;
        return {
          type: 'system',
          id: part.id,
          timestamp: p.time?.created ? toISOTimestamp(p.time.created) : new Date().toISOString(),
          subtype: 'error',
          message: `Retry attempt ${p.attempt}: ${p.error?.message || 'Unknown error'}`,
          metadata: {
            attempt: p.attempt,
            error: p.error,
          },
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

      // Skip these part types - not displayed in conversation
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

/**
 * Convert a Part to an incomplete block (for block_start events)
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

      // Step events are handled as LogEvent, not ConversationBlock
      case 'step-start':
      case 'step-finish':
      case 'retry':
        return null;

      // For other types, return the full block
      default:
        return partToBlock(part, model);
    }
  } catch (error) {
    return null;
  }
}

/**
 * Check if a tool part is a task (subagent) tool
 */
function isTaskTool(part: Part): boolean {
  return part.type === 'tool' && part.tool === 'task';
}

/**
 * Extract SubagentBlock from a task tool part
 */
function extractSubagentBlock(part: Part & { type: 'tool' }): SubagentBlock | null {
  const state = part.state as any;

  if (!state.metadata?.sessionId) {
    return null;
  }

  return {
    type: 'subagent',
    id: part.id,
    timestamp: state.time?.start ? toISOTimestamp(state.time.start) : new Date().toISOString(),
    subagentId: state.metadata.sessionId,
    name: state.input?.subagent_type,
    input: state.input?.prompt || state.input?.description || '',
    status: mapToolStatus(state.status) as any,
    output: typeof state.output === 'string' ? state.output : undefined,
    durationMs: state.time?.end && state.time?.start
      ? state.time.end - state.time.start
      : undefined,
    toolUseId: part.callID,
  };
}

// ============================================================================
// Stream Event Converters
// ============================================================================

/**
 * State for tracking active blocks
 */
interface ActiveBlockState {
  block: ConversationBlock;
  conversationId: string;
  accumulatedContent: string; // For text/reasoning blocks
}

/**
 * Create a new session event parser instance
 * This allows for isolated state per session
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
      // Before adding a new block, complete any active text/reasoning blocks
      for (const [blockId, state] of activeBlocks) {
        if (state.block.type === 'assistant_text' || state.block.type === 'thinking') {
          if (state.accumulatedContent.trim()) {
            logger.debug({
              action: 'completing_block_with_content',
              blockId,
              blockType: state.block.type,
              contentLength: state.accumulatedContent.length,
            }, 'Completing text/reasoning block with content');
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
          } else {
            // Block had no content - this is the problematic case causing ghost blocks
            logger.warn({
              action: 'discarding_empty_block',
              blockId,
              blockType: state.block.type,
              newBlockId: part.id,
              newBlockType: part.type,
            }, 'Discarding empty text/reasoning block without completing');
          }
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
          events.push(
            createSessionEvent(
              'block:start',
              { block: subagentBlock },
              { conversationId, source: 'runner' }
            )
          );
          return events;
        }
      }

      // Create block_start event
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
      } else {
        logger.warn({
          action: 'delta_without_active_block',
          blockId: part.id,
          partType: part.type,
        }, 'Received delta for block not in activeBlocks');
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

      // If tool is completed or errored, emit both tool_use and tool_result blocks
      if (state.status === 'completed' || state.status === 'error') {
        activeBlocks.delete(part.id);

        logger.info({
          toolName: part.tool,
          hasOutput: !!state.output,
          outputType: typeof state.output,
          hasError: !!state.error,
          status: state.status,
        }, 'Tool completed - debugging output');

        // Emit block_complete for the tool_use block itself
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

        // Emit tool_result as block_complete
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
    const conversationId = sessionID === mainSessionId ? 'main' : sessionID;
    const events: AnySessionEvent[] = [];

    // Complete all pending text/reasoning blocks before clearing
    for (const [blockId, state] of activeBlocks) {
      if (state.block.type === 'assistant_text' || state.block.type === 'thinking') {
        if (state.accumulatedContent.trim()) {
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
   * Reset the active blocks tracker
   */
  function reset(): void {
    activeBlocks.clear();
  }

  return {
    parseEvent,
    reset,
  };
}

/**
 * Parse an OpenCode SDK Event into SessionEvents (stateless version)
 * Note: For proper streaming, use createStreamEventParser() instead
 *
 * @deprecated Use createStreamEventParser for stateful parsing
 */
export function parseOpencodeStreamEvent(
  event: Event,
  mainSessionId: string,
  options: ConvertOptions = {}
): AnySessionEvent[] {
  const parser = createStreamEventParser(mainSessionId, options);
  return parser.parseEvent(event);
}
