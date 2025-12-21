/**
 * OpenCode Block Converter (Stateless)
 *
 * Converts OpenCode SDK events to SessionEvents.
 * Each event is converted independently - no state is maintained between calls.
 * The reducer handles all state management (deduplication, role tracking, etc.)
 *
 * Event mapping:
 * - message.updated (role=user) → block:upsert for user_message (status: complete)
 * - message.part.updated → block:upsert (status: pending) + block:delta
 * - message.part.updated (tool completed) → block:upsert (status: complete) + tool_result
 * - session.idle → session:idle (finalizes any pending blocks)
 */

import type { Event, Part } from "@opencode-ai/sdk/v2";
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
  extractSubagentBlock,
} from './shared-helpers.js';

// ============================================================================
// Part to Block Converters
// ============================================================================

/**
 * Convert a Part to a ConversationBlock
 * Returns null for parts that don't map to blocks
 * Blocks include BlockLifecycleStatus (pending for streaming, complete for finalized)
 */
function partToBlock(part: Part, model?: string): ConversationBlock | null {
  try {
    switch (part.type) {
      case 'text':
        return {
          type: 'assistant_text',
          id: part.id,
          timestamp: getPartTimestamp(part),
          content: (part as any).text || '',
          status: 'pending' as BlockLifecycleStatus, // Streaming, will be finalized on session:idle
          model,
        };

      case 'reasoning':
        return {
          type: 'thinking',
          id: part.id,
          timestamp: getPartTimestamp(part),
          content: (part as any).text || '',
          status: 'pending' as BlockLifecycleStatus, // Streaming, will be finalized on session:idle
        };

      case 'tool': {
        const state = part.state as any;

        // Check if this is a Task tool (subagent)
        if (isTaskTool(part)) {
          const subagentBlock = extractSubagentBlock(part as any);
          if (subagentBlock) {
            return subagentBlock; // extractSubagentBlock already sets status
          }
        }

        return {
          type: 'tool_use',
          id: part.id,
          timestamp: state.time?.start ? toISOTimestamp(state.time.start) : new Date().toISOString(),
          toolName: part.tool,
          toolUseId: part.callID,
          input: state.input || {},
          status: mapToBlockStatus(state.status), // pending/running → pending, completed/error → complete
          displayName: state.title,
        };
      }

      // Skip these part types (handled elsewhere or not blocks)
      case 'step-start':
      case 'step-finish':
      case 'retry':
      case 'file':
      case 'snapshot':
      case 'patch':
      case 'compaction':
      case 'agent':
      case 'subtask':
        return null;

      default:
        return null;
    }
  } catch {
    return null;
  }
}

// ============================================================================
// Main Event Converter (Stateless)
// ============================================================================

/**
 * Convert an OpenCode SDK Event to SessionEvents.
 *
 * This is a pure, stateless function. Each event is converted independently.
 * The reducer handles:
 * - Deduplication (via upsertBlock)
 * - Role tracking (user vs assistant messages)
 * - Streaming content accumulation
 * - Block finalization on session:idle
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
  const logger = options.logger ?? noopLogger;

  try {
    switch (event.type) {
      // -----------------------------------------------------------------------
      // Message Events
      // -----------------------------------------------------------------------

      case 'message.updated': {
        const { info } = event.properties as any;
        const conversationId = info.sessionID === mainSessionId ? 'main' : info.sessionID;

        // User message → create user_message block immediately (already complete)
        if (info.role === 'user') {
          const userBlock: ConversationBlock = {
            type: 'user_message',
            id: info.id,
            timestamp: info.time?.created ? toISOTimestamp(info.time.created) : new Date().toISOString(),
            content: '', // Content comes from message.part.updated
            status: 'complete' as BlockLifecycleStatus, // User message is always complete
          };

          return [
            createSessionEvent(
              'block:upsert',
              { block: userBlock },
              { conversationId, source: 'runner' }
            ),
          ];
        }

        // Assistant message → no block yet, parts will create blocks
        // But emit metadata if available
        if (info.role === 'assistant' && (info.tokens || info.cost !== undefined)) {
          return [
            createSessionEvent(
              'metadata:update',
              {
                metadata: {
                  usage: info.tokens ? {
                    inputTokens: info.tokens.input || 0,
                    outputTokens: info.tokens.output || 0,
                    thinkingTokens: info.tokens.reasoning || 0,
                    cacheReadTokens: info.tokens.cache?.read || 0,
                    cacheWriteTokens: info.tokens.cache?.write || 0,
                    totalTokens: (info.tokens.input || 0) + (info.tokens.output || 0),
                  } : undefined,
                  costUSD: info.cost,
                  model: info.modelID,
                },
              },
              { conversationId, source: 'runner' }
            ),
          ];
        }

        return [];
      }

      case 'message.part.updated': {
        const { part, delta } = event.properties as any;
        const conversationId = part.sessionID === mainSessionId ? 'main' : part.sessionID;
        const events: AnySessionEvent[] = [];

        // Handle step/retry events as log events
        if (part.type === 'step-start' || part.type === 'step-finish' || part.type === 'retry') {
          return [
            createSessionEvent(
              'log',
              {
                level: part.type === 'retry' ? 'warn' : 'info',
                message: part.type === 'step-start' ? 'Step started'
                       : part.type === 'step-finish' ? `Step finished: ${part.reason || 'unknown'}`
                       : `Retry attempt ${part.attempt || '?'}: ${part.error?.message || 'Unknown error'}`,
                data: {
                  partType: part.type,
                  partId: part.id,
                },
              },
              { source: 'runner' }
            ),
          ];
        }

        // Convert part to block
        const block = partToBlock(part);
        if (!block) return [];

        // Handle subagent (Task tool) specially
        if (block.type === 'subagent') {
          const toolUseId = part.callID;
          const state = part.state as any;

          // Emit subagent:spawned (reducer updates agentId if now available)
          // Use correct conversationId for nested subagents
          events.push(
            createSessionEvent(
              'subagent:spawned',
              {
                toolUseId,
                agentId: state.metadata?.sessionId,
                prompt: state?.input?.prompt || state?.input?.description || '',
                subagentType: state?.input?.subagent_type,
                description: state?.input?.description,
              },
              { conversationId, source: 'runner' }
            )
          );

          // Check if subagent completed - emit subagent:completed
          if (state.status === 'completed' || state.status === 'error') {
            events.push(
              createSessionEvent(
                'subagent:completed',
                {
                  toolUseId,
                  agentId: state.metadata?.sessionId,
                  status: state.status === 'completed' ? 'completed' : 'failed',
                  output: typeof state.output === 'string' ? state.output : undefined,
                  durationMs: state.time?.end && state.time?.start
                    ? state.time.end - state.time.start
                    : undefined,
                },
                { conversationId, source: 'runner' }
              )
            );
          }

          return events;
        }

        // Emit block:upsert (reducer deduplicates via upsertBlock)
        events.push(
          createSessionEvent(
            'block:upsert',
            { block },
            { conversationId, source: 'runner' }
          )
        );

        // Emit delta for streaming text
        if (delta && (part.type === 'text' || part.type === 'reasoning')) {
          events.push(
            createSessionEvent(
              'block:delta',
              { blockId: part.id, delta },
              { conversationId, source: 'runner' }
            )
          );
        }

        // Handle tool completion - emit tool_result block
        if (part.type === 'tool') {
          const state = part.state as any;

          if (state.status === 'completed' || state.status === 'error') {
            // Regular tool - emit tool_result as block:upsert
            const toolResultBlock: ConversationBlock = {
              type: 'tool_result',
              id: `result-${part.id}`,
              timestamp: state.time?.end ? toISOTimestamp(state.time.end) : new Date().toISOString(),
              toolUseId: part.callID,
              output: state.status === 'error' ? state.error : state.output,
              isError: state.status === 'error',
              status: 'complete' as BlockLifecycleStatus,
              durationMs: state.time?.end && state.time?.start
                ? state.time.end - state.time.start
                : undefined,
            };

            events.push(
              createSessionEvent(
                'block:upsert',
                { block: toolResultBlock },
                { conversationId, source: 'runner' }
              )
            );
          }
        }

        return events;
      }

      // -----------------------------------------------------------------------
      // Session Events
      // -----------------------------------------------------------------------

      case 'session.idle': {
        const { sessionID } = event.properties as any;
        const conversationId = sessionID === mainSessionId ? 'main' : sessionID;
        return [
          createSessionEvent(
            'session:idle',
            { sessionId: sessionID },
            { conversationId, source: 'runner' }
          ),
        ];
      }

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

      // -----------------------------------------------------------------------
      // Events we don't need to convert
      // -----------------------------------------------------------------------

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

