/**
 * Transcript Utilities
 *
 * Utilities for parsing session transcripts from different agent architectures.
 * Delegates to @hhopkins/agent-converters for the actual parsing/conversion logic.
 */

import { randomUUID } from 'crypto';
import { claudeSdk, opencode, type ConversationBlock } from '@hhopkins/agent-converters';
import type { AGENT_ARCHITECTURE_TYPE } from '@ai-systems/shared-types';
import { logger } from '../../config/logger.js';

const { parseClaudeTranscriptFile, convertMessagesToBlocks } = claudeSdk;
const { parseOpenCodeTranscriptFile } = opencode;

/**
 * Combined transcript format for Claude SDK.
 * Wraps the main JSONL + all subagent JSONLs into a single JSON blob.
 * This is our abstraction layer - Claude natively uses separate files.
 */
export interface CombinedClaudeTranscript {
    main: string;  // raw JSONL
    subagents: { id: string; transcript: string }[];
}

/**
 * Result of parsing a transcript
 */
export interface ParsedTranscript {
    blocks: ConversationBlock[];
    subagents: { id: string; blocks: ConversationBlock[] }[];
}

/**
 * Parse a transcript based on the agent architecture type.
 *
 * For Claude SDK: expects combined JSON format { main: string, subagents: [...] }
 * For OpenCode: expects native JSON format from `opencode export`
 *
 * @param architecture - The agent architecture type
 * @param rawTranscript - The raw transcript string
 * @returns Parsed blocks and subagent conversations
 */
export function parseTranscript(
    architecture: AGENT_ARCHITECTURE_TYPE,
    rawTranscript: string
): ParsedTranscript {
    if (!rawTranscript) {
        return { blocks: [], subagents: [] };
    }

    switch (architecture) {
        case 'claude-agent-sdk':
            return parseClaudeTranscriptCombined(rawTranscript);
        case 'opencode':
            return parseOpenCodeTranscriptFile(rawTranscript);
        default:
            logger.warn({ architecture }, 'Unknown architecture for transcript parsing');
            return { blocks: [], subagents: [] };
    }
}

/**
 * Parse a combined Claude SDK transcript (our format) into blocks.
 */
function parseClaudeTranscriptCombined(combinedTranscript: string): ParsedTranscript {
    try {
        const combined: CombinedClaudeTranscript = JSON.parse(combinedTranscript);

        const mainBlocks = convertMessagesToBlocks(parseClaudeTranscriptFile(combined.main));
        const subagentBlocks = combined.subagents
            .map(raw => ({
                id: raw.id,
                blocks: convertMessagesToBlocks(parseClaudeTranscriptFile(raw.transcript))
            }))
            .filter(subagent => subagent.blocks.length > 1); // Filter out default random subagents

        return {
            blocks: mainBlocks,
            subagents: subagentBlocks
        };

    } catch (error) {
        // If parsing fails, try treating it as raw JSONL (backwards compatibility)
        logger.warn({ error }, 'Failed to parse as CombinedClaudeTranscript, falling back to raw JSONL');
        return {
            blocks: [],
            subagents: []
        };
    }
}

/**
 * Create a new session ID with the proper formatting for the given architecture.
 *
 * @param architecture - The agent architecture type
 * @returns A new session ID
 */
export function createSessionId(architecture: AGENT_ARCHITECTURE_TYPE): string {
    switch (architecture) {
        case 'claude-agent-sdk':
            return randomUUID();
        case 'opencode':
            return randomUUID();
        default:
            return randomUUID();
    }
}
