/**
 * Transcript Parser - Parse Claude SDK JSONL transcript files
 *
 * Claude SDK stores transcripts as JSONL (JSON Lines) files:
 * - Main session: {sessionId}.jsonl
 * - Subagents/tasks: agent-{uuid}.jsonl
 *
 * Each line is a JSON object representing an SDK message.
 *
 * Also supports parsing "combined transcripts" - a wrapper format that bundles
 * the main transcript and all subagent transcripts into a single JSON blob.
 */

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type {
  CombinedClaudeTranscript,
  SessionConversationState,
  AnySessionEvent,
} from '@ai-systems/shared-types';
import { createInitialConversationState } from '@ai-systems/shared-types';
import { noopLogger } from '../utils.js';
import type { ParseTranscriptOptions } from '../types.js';
import { sdkMessageToEvents } from './block-converter.js';
import { reduceSessionEvent } from '../session-state/reducer.js';

/**
 * Parse JSONL transcript file content into array of SDK messages
 *
 * @param content - Raw JSONL file content
 * @param options - Optional configuration including logger
 * @returns Array of parsed SDK messages
 */
export function parseClaudeTranscriptFile(
  content: string,
  options: ParseTranscriptOptions = {}
): SDKMessage[] {
  const logger = options.logger ?? noopLogger;
  const lines = content.trim().split('\n').filter((line) => line.trim().length > 0);
  const messages: SDKMessage[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;

    try {
      const message = JSON.parse(line) as SDKMessage;
      messages.push(message);
    } catch (error) {
      logger.warn(
        { error, lineNumber: i + 1, line: line.substring(0, 100) },
        'Failed to parse transcript line (skipping)'
      );
      // Continue parsing other lines
    }
  }

  return messages;
}

// =============================================================================
// Combined Transcript Format
// =============================================================================

/**
 * Convert SDK messages to session events with the given conversation ID
 */
function messagesToEvents(
  messages: SDKMessage[],
  conversationId: string,
  options: ParseTranscriptOptions = {}
): AnySessionEvent[] {
  const events: AnySessionEvent[] = [];

  for (const msg of messages) {
    const msgEvents = sdkMessageToEvents(msg, options);
    // Set the conversationId on each event's context
    for (const event of msgEvents) {
      if (event.context) {
        event.context.conversationId = conversationId;
      }
      events.push(event);
    }
  }

  return events;
}

/**
 * Parse a combined Claude transcript (JSON wrapper format) into SessionConversationState.
 *
 * The combined format bundles the main transcript and all subagent transcripts
 * into a single JSON object for easier storage and transport.
 *
 * Uses the shared reducer to build state from events, ensuring consistency
 * with streaming state updates.
 *
 * @param combinedTranscript - JSON string of the combined transcript
 * @param options - Optional configuration including logger
 * @returns SessionConversationState with blocks, subagents, and streaming state
 */
export function parseCombinedClaudeTranscript(
  combinedTranscript: string,
  options: ParseTranscriptOptions = {}
): SessionConversationState {
  const logger = options.logger ?? noopLogger;

  if (!combinedTranscript) {
    return createInitialConversationState();
  }

  try {
    const combined: CombinedClaudeTranscript = JSON.parse(combinedTranscript);

    // Start with initial state
    let state = createInitialConversationState();

    // Convert main transcript messages to events and reduce
    const mainMessages = parseClaudeTranscriptFile(combined.main, options);
    const mainEvents = messagesToEvents(mainMessages, 'main', options);

    for (const event of mainEvents) {
      state = reduceSessionEvent(state, event);
    }

    // Process each subagent transcript
    // Subagent entries are created by subagent:spawned events from the main transcript
    for (const rawSubagent of combined.subagents) {
      const subagentMessages = parseClaudeTranscriptFile(rawSubagent.transcript, options);

      // Skip empty subagents (Claude creates some on startup)
      if (subagentMessages.length <= 1) {
        continue;
      }

      // Convert subagent messages to events and reduce
      // Events are routed to the correct subagent by conversationId
      const subagentEvents = messagesToEvents(subagentMessages, rawSubagent.id, options);

      for (const event of subagentEvents) {
        state = reduceSessionEvent(state, event);
      }
    }

    return state;
  } catch (error) {
    // If parsing fails, log and return empty state
    logger.warn(
      { error },
      'Failed to parse as CombinedClaudeTranscript'
    );
    return createInitialConversationState();
  }
}
