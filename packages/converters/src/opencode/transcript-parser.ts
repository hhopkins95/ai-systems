/**
 * Transcript Parser - Parse OpenCode exported session files
 *
 * OpenCode stores sessions as JSON files that can be exported.
 * This parser converts the exported format to SessionConversationState
 * using the shared reducer for event processing.
 */

import type { FileDiff, UserMessage, AssistantMessage, Part } from "@opencode-ai/sdk";
import type {
  SessionConversationState,
  AnySessionEvent,
} from '@ai-systems/shared-types';
import { createInitialConversationState, createSessionEvent } from '@ai-systems/shared-types';
import { toISOTimestamp, noopLogger } from '../utils.js';
import type { ParseTranscriptOptions } from '../types.js';
import { reduceSessionEvent } from '../session-state/reducer.js';
import {
  isTaskTool,
  partToEvents,
  taskToolToEvents,
} from './shared-helpers.js';

// Re-export helpers for backward compatibility
export { mapToBlockStatus, getPartTimestamp } from './shared-helpers.js';

/**
 * Exported session type when running `opencode export <sessionId>`
 */
export interface OpenCodeSessionTranscript {
  info: {
    id: string;
    projectID: string;
    directory: string;
    parentID?: string;
    title: string;
    version: string;
    time: {
      created: number;
      updated: number;
      compacting?: number;
    };
    summary?: {
      additions: number;
      deletions: number;
      files: number;
      diffs?: FileDiff[];
    };
    share?: { url: string };
    revert?: { messageID: string; partID?: string; snapshot?: string; diff?: string };
  };
  messages: Array<{
    info: UserMessage | AssistantMessage;
    parts: Part[];
  }>;
}

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
          'block:complete',
          {
            blockId: info.id,
            block: {
              type: 'user_message',
              id: info.id,
              timestamp: toISOTimestamp(info.time.created),
              content,
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
