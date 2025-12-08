/**
 * Transcript types for agent session parsing
 *
 * These types are shared across converters and runtime packages
 * for representing parsed transcript data in a normalized format.
 */

import type { ConversationBlock } from './runtime/index.js';

/**
 * Result of parsing a transcript (unified across architectures)
 */
export interface ParsedTranscript {
  /** Conversation blocks from the main transcript */
  blocks: ConversationBlock[];
  /** Subagent conversations */
  subagents: { id: string; blocks: ConversationBlock[] }[];
}

/**
 * Combined transcript format for Claude SDK.
 * Wraps the main JSONL + all subagent JSONLs into a single JSON blob.
 * This is an abstraction layer - Claude natively uses separate files.
 */
export interface CombinedClaudeTranscript {
  /** Raw JSONL content of the main transcript */
  main: string;
  /** Subagent transcripts */
  subagents: { id: string; transcript: string }[];
}
