/**
 * Transcript types for agent session parsing
 *
 * These types are shared across converters and runtime packages
 * for representing parsed transcript data in a normalized format.
 */

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



// ============= OPENCODE ================

import type { FileDiff, UserMessage, AssistantMessage, Part } from "@opencode-ai/sdk";
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

