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
import type { CombinedClaudeTranscript, ParsedTranscript } from '@ai-systems/shared-types';
import { noopLogger } from '../utils.js';
import type { ParseTranscriptOptions } from '../types.js';
import { convertMessagesToBlocks } from './block-converter.js';

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
 * Alias for backward compatibility
 * @deprecated Use ParsedTranscript from @ai-systems/shared-types
 */
export type ParsedCombinedTranscript = ParsedTranscript;

/**
 * Parse a combined Claude transcript (JSON wrapper format) into conversation blocks.
 *
 * The combined format bundles the main transcript and all subagent transcripts
 * into a single JSON object for easier storage and transport.
 *
 * @param combinedTranscript - JSON string of the combined transcript
 * @param options - Optional configuration including logger
 * @returns Parsed blocks and subagent conversations
 */
export function parseCombinedClaudeTranscript(
  combinedTranscript: string,
  options: ParseTranscriptOptions = {}
): ParsedCombinedTranscript {
  const logger = options.logger ?? noopLogger;

  if (!combinedTranscript) {
    return { blocks: [], subagents: [] };
  }

  try {
    const combined: CombinedClaudeTranscript = JSON.parse(combinedTranscript);

    const mainBlocks = convertMessagesToBlocks(
      parseClaudeTranscriptFile(combined.main, options)
    );

    const subagentBlocks = combined.subagents
      .map((raw) => ({
        id: raw.id,
        blocks: convertMessagesToBlocks(
          parseClaudeTranscriptFile(raw.transcript, options)
        ),
      }))
      // Filter out default random subagents that Claude creates on startup
      .filter((subagent) => subagent.blocks.length > 1);

    return {
      blocks: mainBlocks,
      subagents: subagentBlocks,
    };
  } catch (error) {
    // If parsing fails, log and return empty
    logger.warn(
      { error },
      'Failed to parse as CombinedClaudeTranscript'
    );
    return { blocks: [], subagents: [] };
  }
}
