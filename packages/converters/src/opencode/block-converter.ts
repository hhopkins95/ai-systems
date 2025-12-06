/**
 * Block Converter - Convert OpenCode SDK events to StreamEvents
 *
 * Transforms OpenCode SDK events (from SSE streaming) into architecture-agnostic
 * StreamEvent structures for real-time UI updates.
 */

import type { Event, Part, EventMessagePartUpdated, EventMessageUpdated, EventSessionIdle } from "@opencode-ai/sdk";
import type {
  ConversationBlock,
  SubagentBlock,
  ToolExecutionStatus,
  StreamEvent,
} from '@ai-systems/shared-types';
import type { Logger } from '../utils.js';
import { generateId, toISOTimestamp, noopLogger } from '../utils.js';
import { mapToolStatus, getPartTimestamp } from './transcript-parser.js';

export interface ConvertOptions {
  logger?: Logger;
}

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
 * Create a new stream event parser instance
 * This allows for isolated state per session
 */
export function createStreamEventParser(mainSessionId: string, options: ConvertOptions = {}) {
  const logger = options.logger ?? noopLogger;
  const activeBlocks = new Map<string, ActiveBlockState>();

  /**
   * Parse a message.part.updated event
   */
  function parsePartUpdatedEvent(event: EventMessagePartUpdated): StreamEvent[] {
    const { part, delta } = event.properties;
    const conversationId = part.sessionID === mainSessionId ? 'main' : part.sessionID;
    const events: StreamEvent[] = [];

    // Check if this is a new block or an update to existing
    const isNewBlock = !activeBlocks.has(part.id);

    if (isNewBlock) {
      // Before adding a new block, complete any active text/reasoning blocks
      for (const [blockId, state] of activeBlocks) {
        if (state.block.type === 'assistant_text' || state.block.type === 'thinking') {
          if (state.accumulatedContent.trim()) {
            events.push({
              type: 'block_complete',
              blockId,
              conversationId: state.conversationId,
              block: {
                ...state.block,
                content: state.accumulatedContent,
              } as ConversationBlock,
            });
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
          events.push({
            type: 'block_start',
            block: subagentBlock,
            conversationId,
          });
          return events;
        }
      }

      // Create block_start event
      const incompleteBlock = partToIncompleteBlock(part);
      if (incompleteBlock) {
        activeBlocks.set(part.id, {
          block: incompleteBlock,
          conversationId,
          accumulatedContent: '',
        });
        events.push({
          type: 'block_start',
          block: incompleteBlock,
          conversationId,
        });
      }
    }

    // Handle text delta for streaming content
    if (delta && (part.type === 'text' || part.type === 'reasoning')) {
      const activeState = activeBlocks.get(part.id);
      if (activeState) {
        activeState.accumulatedContent += delta;
      }

      events.push({
        type: 'text_delta',
        blockId: part.id,
        delta,
        conversationId,
      });
    }

    // Handle tool state updates
    if (part.type === 'tool') {
      const state = part.state as any;
      const status = mapToolStatus(state.status);

      events.push({
        type: 'block_update',
        blockId: part.id,
        conversationId,
        updates: {
          status,
          displayName: state.title,
        } as any,
      });

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

        events.push({
          type: 'block_complete',
          blockId: part.id,
          block: toolUseBlock,
          conversationId,
        });

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

        events.push({
          type: 'block_complete',
          blockId: resultBlock.id,
          block: resultBlock,
          conversationId,
        });
      }
    }

    return events;
  }

  /**
   * Parse a message.updated event for metadata updates
   */
  function parseMessageUpdatedEvent(event: EventMessageUpdated): StreamEvent[] {
    const { info } = event.properties;

    if (info.role !== 'assistant') {
      return [];
    }

    const assistantInfo = info as any;
    const conversationId = info.sessionID === mainSessionId ? 'main' : info.sessionID;

    if (!assistantInfo.tokens && assistantInfo.cost === undefined) {
      return [];
    }

    return [{
      type: 'metadata_update',
      conversationId,
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
    }];
  }

  /**
   * Parse a session.idle event (session completed)
   */
  function parseSessionIdleEvent(event: EventSessionIdle): StreamEvent[] {
    const { sessionID } = event.properties;
    const conversationId = sessionID === mainSessionId ? 'main' : sessionID;
    const events: StreamEvent[] = [];

    // Complete all pending text/reasoning blocks before clearing
    for (const [blockId, state] of activeBlocks) {
      if (state.block.type === 'assistant_text' || state.block.type === 'thinking') {
        if (state.accumulatedContent.trim()) {
          events.push({
            type: 'block_complete',
            blockId,
            conversationId: state.conversationId,
            block: {
              ...state.block,
              content: state.accumulatedContent,
            } as ConversationBlock,
          });
        }
      }
    }

    activeBlocks.clear();

    events.push({
      type: 'block_complete',
      blockId: generateId(),
      conversationId,
      block: {
        type: 'system',
        id: generateId(),
        timestamp: new Date().toISOString(),
        subtype: 'session_end',
        message: 'Session completed',
        metadata: {
          sessionId: sessionID,
        },
      },
    });

    return events;
  }

  /**
   * Parse an OpenCode SDK Event into StreamEvents
   */
  function parseEvent(event: Event): StreamEvent[] {
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
          return [{
            type: 'block_complete',
            blockId: generateId(),
            conversationId: 'main',
            block: {
              type: 'system',
              id: generateId(),
              timestamp: new Date().toISOString(),
              subtype: 'error',
              message: e.properties?.message || 'Session error',
              metadata: e.properties,
            },
          }];
        }

        // Events we don't need to convert to stream events
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
      logger.error({ error, event }, 'Failed to parse OpenCode stream event');
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
 * Parse an OpenCode SDK Event into StreamEvents (stateless version)
 * Note: For proper streaming, use createStreamEventParser() instead
 *
 * @deprecated Use createStreamEventParser for stateful parsing
 */
export function parseOpencodeStreamEvent(
  event: Event,
  mainSessionId: string,
  options: ConvertOptions = {}
): StreamEvent[] {
  const parser = createStreamEventParser(mainSessionId, options);
  return parser.parseEvent(event);
}
