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
import {
  createInitialConversationState,
  createSubagentState,
} from '@ai-systems/shared-types';
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

/**
 * Extract subagent ID from filename
 *
 * Examples:
 * - "agent-abc123.jsonl" → "agent-abc123"
 * - "abc123.jsonl" → null (main transcript)
 *
 * @param filename - Transcript filename
 * @returns Subagent ID or null if main transcript
 */
export function extractSubagentId(filename: string): string | null {
  const basename = filename.replace('.jsonl', '');

  // Check if it starts with agent-
  if (basename.startsWith('agent-')) {
    return basename;
  }

  return null;
}

/**
 * Detect subagent status from transcript messages
 *
 * A subagent is considered:
 * - active: Has messages but no final result
 * - completed: Has a result message
 * - failed: Currently not detected from transcript (errors are handled separately)
 *
 * @param messages - Subagent transcript messages
 * @returns Subagent status
 */
export function detectSubagentStatus(
  messages: SDKMessage[]
): 'active' | 'completed' | 'failed' {
  if (messages.length === 0) {
    return 'active';
  }

  // Check last few messages for result
  const lastMessages = messages.slice(-5);

  for (const msg of lastMessages.reverse()) {
    if (msg.type === 'result') {
      return 'completed';
    }
  }

  return 'active';
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
    for (const rawSubagent of combined.subagents) {
      const subagentMessages = parseClaudeTranscriptFile(rawSubagent.transcript, options);

      // Skip empty subagents (Claude creates some on startup)
      if (subagentMessages.length <= 1) {
        continue;
      }

      // Create subagent entry if it doesn't exist
      // (it may have been created by a subagent:spawned event from main)
      const existingSubagent = state.subagents.find(
        (s) => s.id === rawSubagent.id || s.agentId === rawSubagent.id
      );

      if (!existingSubagent) {
        // Create subagent entry manually since we're loading from transcript
        const newSubagent = createSubagentState(rawSubagent.id, {
          agentId: rawSubagent.id,
          status: detectSubagentStatus(subagentMessages) === 'completed' ? 'success' : 'running',
        });
        state = {
          ...state,
          subagents: [...state.subagents, newSubagent],
        };
      }

      // Convert subagent messages to events and reduce
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
