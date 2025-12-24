/**
 * Transcript Parser - Parse OpenCode exported session files
 *
 * OpenCode stores sessions as JSON files that can be exported.
 * This parser converts the exported format to SessionConversationState
 * using the shared reducer for event processing.
 */

import type {
  AnySessionEvent,
  OpenCodeSessionTranscript,
  CombinedOpenCodeTranscript,
  SessionConversationState,
} from '@ai-systems/shared-types';
import { createInitialConversationState, createSessionEvent } from '@ai-systems/shared-types';
import type { AssistantMessage, Part } from "@opencode-ai/sdk";
import { reduceSessionEvent } from '../../reducers/conversation/reducer.js';
import type { ParseTranscriptOptions } from '../../types.js';
import { noopLogger, toISOTimestamp } from '../../utils.js';
import {
  isTaskTool,
  partToEvents,
  taskToolToEvents,
} from './shared-helpers.js';

// Re-export helpers for backward compatibility
export { getPartTimestamp, mapToBlockStatus } from './shared-helpers.js';

// ============================================================================
// Transcript to Events Conversion
// ============================================================================

/**
 * Convert an OpenCode transcript to SessionEvents.
 * These events can then be processed by the shared reducer.
 */
function transcriptToEvents(
  transcript: OpenCodeSessionTranscript,
  options: ParseTranscriptOptions = {}
): AnySessionEvent[] {
  const logger = options.logger ?? noopLogger;
  const events: AnySessionEvent[] = [];

  for (const message of transcript.messages) {
    const { info, parts } = message;

    if (info.role === 'user') {
      // User message: extract text parts into a single UserMessageBlock
      const textParts = parts.filter(p => p.type === 'text') as Array<Part & { type: 'text' }>;
      const content = textParts.map(p => p.text).join('\n');

      if (content) {
        events.push(createSessionEvent(
          'block:upsert',
          {
            block: {
              type: 'user_message',
              id: info.id,
              timestamp: toISOTimestamp(info.time.created),
              content,
              status: 'complete',
            },
          },
          { conversationId: 'main', source: 'runner' }
        ));
      }
    } else if (info.role === 'assistant') {
      const assistantInfo = info as AssistantMessage;
      const model = assistantInfo.modelID;

      // Process each part
      for (const part of parts) {
        // Special handling for task tools (subagent extraction)
        if (part.type === 'tool' && isTaskTool(part)) {
          const taskEvents = taskToolToEvents(part as any, model, logger);
          events.push(...taskEvents);
        } else {
          // Regular part conversion
          const partEvents = partToEvents(part, model, 'main', logger);
          events.push(...partEvents);
        }
      }
    }
  }

  return events;
}

// ============================================================================
// Main Parser
// ============================================================================

/**
 * Parse an OpenCode exported transcript file into SessionConversationState
 *
 * Uses the shared reducer for event processing, ensuring parity with streaming.
 *
 * @param content - JSON string content of the exported transcript
 * @param options - Optional configuration including logger
 * @returns SessionConversationState with blocks, subagents, and streaming state
 */
export function parseOpenCodeTranscriptFile(
  content: string,
  options: ParseTranscriptOptions = {}
): SessionConversationState {
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

  // Convert transcript to events
  const events = transcriptToEvents(transcript, options);

  // Run through reducer
  let state = createInitialConversationState();
  for (const event of events) {
    state = reduceSessionEvent(state, event);
  }

  return state;
}

/**
 * Parse a combined OpenCode transcript (main + subagents) into SessionConversationState
 *
 * The combined format includes the main transcript and all subagent transcripts
 * bundled together. Each subagent gets parsed and merged into the state.
 *
 * @param content - JSON string of CombinedOpenCodeTranscript
 * @param options - Optional configuration including logger
 * @returns SessionConversationState with main conversation and all subagent conversations
 */
export function parseCombinedOpenCodeTranscript(
  content: string,
  options: ParseTranscriptOptions = {}
): SessionConversationState {
  const logger = options.logger ?? noopLogger;

  let combined: CombinedOpenCodeTranscript;
  try {
    combined = JSON.parse(content) as CombinedOpenCodeTranscript;
  } catch (error) {
    const preview = content.substring(0, 100);
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMsg, contentPreview: preview }, 'Failed to parse combined OpenCode transcript JSON');
    throw new Error(`Invalid combined OpenCode transcript JSON: ${errorMsg}. Content starts with: ${preview}...`);
  }

  // Parse main transcript
  let mainTranscript: OpenCodeSessionTranscript;
  try {
    mainTranscript = JSON.parse(combined.main) as OpenCodeSessionTranscript;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMsg }, 'Failed to parse main transcript in combined format');
    throw new Error(`Invalid main transcript JSON: ${errorMsg}`);
  }

  // Convert main transcript to events and build initial state
  const mainEvents = transcriptToEvents(mainTranscript, options);
  let state = createInitialConversationState();
  for (const event of mainEvents) {
    state = reduceSessionEvent(state, event);
  }

  // Parse each subagent transcript and merge into state
  for (const { id, transcript } of combined.subagents) {
    let subTranscript: OpenCodeSessionTranscript;
    try {
      subTranscript = JSON.parse(transcript) as OpenCodeSessionTranscript;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn({ error: errorMsg, subagentId: id }, 'Failed to parse subagent transcript, skipping');
      continue;
    }

    // Convert subagent transcript to events with subagent's conversation ID
    const subEvents = transcriptToEventsForSubagent(subTranscript, id, options);
    for (const event of subEvents) {
      state = reduceSessionEvent(state, event);
    }
  }

  return state;
}

/**
 * Convert an OpenCode transcript to SessionEvents for a specific subagent conversation.
 * Similar to transcriptToEvents but uses the subagent ID as conversation ID.
 */
function transcriptToEventsForSubagent(
  transcript: OpenCodeSessionTranscript,
  conversationId: string,
  options: ParseTranscriptOptions = {}
): AnySessionEvent[] {
  const logger = options.logger ?? noopLogger;
  const events: AnySessionEvent[] = [];

  for (const message of transcript.messages) {
    const { info, parts } = message;

    if (info.role === 'user') {
      // User message (prompt to subagent)
      const textParts = parts.filter(p => p.type === 'text') as Array<Part & { type: 'text' }>;
      const content = textParts.map(p => p.text).join('\n');

      if (content) {
        events.push(createSessionEvent(
          'block:upsert',
          {
            block: {
              type: 'user_message',
              id: info.id,
              timestamp: toISOTimestamp(info.time.created),
              content,
              status: 'complete',
            },
          },
          { conversationId, source: 'runner' }
        ));
      }
    } else if (info.role === 'assistant') {
      const assistantInfo = info as AssistantMessage;
      const model = assistantInfo.modelID;

      // Process each part (no nested subagent handling - single level only)
      for (const part of parts) {
        const partEvents = partToEvents(part, model, conversationId, logger);
        events.push(...partEvents);
      }
    }
  }

  return events;
}
