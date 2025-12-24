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
} from '@ai-systems/shared-types';
import { createInitialConversationState } from '@ai-systems/shared-types';
import { noopLogger } from '../../utils.js';
import type { ParseTranscriptOptions } from '../../types.js';
import { createClaudeSdkEventConverter } from './block-converter.js';
import { reduceSessionEvent } from '../../reducers/conversation/reducer.js';

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
 * Parse a combined Claude transcript (JSON wrapper format) into SessionConversationState.
 *
 * The combined format bundles the main transcript and all subagent transcripts
 * into a single JSON object for easier storage and transport.
 *
 * Uses the stateful converter factory to ensure consistent ID generation
 * between streaming and transcript loading paths.
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

    // Create converter (no initial state for fresh transcript parse)
    const converter = createClaudeSdkEventConverter(undefined, options);

    // Start with initial state
    let state = createInitialConversationState();

    // Parse main transcript messages
    const mainMessages = parseClaudeTranscriptFile(combined.main, options);
    for (const msg of mainMessages) {
      const events = converter.parseEvent(msg);
      for (const event of events) {
        // Ensure conversationId is set for main conversation
        if (event.context) {
          event.context.conversationId = event.context.conversationId || 'main';
        }
        state = reduceSessionEvent(state, event);
      }
    }

    // Process each subagent transcript
    // Subagent entries are created by subagent:spawned events from the main transcript
    for (const rawSubagent of combined.subagents) {
      const subagentMessages = parseClaudeTranscriptFile(rawSubagent.transcript, options);

      // Skip empty subagents (Claude creates some on startup)
      if (subagentMessages.length <= 1) {
        continue;
      }

      // Parse subagent messages with explicit targetConversationId
      // This ensures blocks are routed to the subagent's conversation, not main
      for (const msg of subagentMessages) {
        const events = converter.parseEvent(msg, rawSubagent.id);
        for (const event of events) {
          state = reduceSessionEvent(state, event);
        }
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
