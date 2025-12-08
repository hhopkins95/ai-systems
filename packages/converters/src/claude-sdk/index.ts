/**
 * Claude SDK Converters
 *
 * Functions for parsing Claude SDK transcripts and converting
 * SDK messages to ConversationBlocks and StreamEvents.
 */

// Re-export shared types
export type { ConvertOptions, ParseTranscriptOptions } from '../types.js';
export type { CombinedClaudeTranscript, ParsedTranscript } from '@ai-systems/shared-types';

// Transcript parsing
export {
  parseClaudeTranscriptFile,
  extractSubagentId,
  detectSubagentStatus,
  parseCombinedClaudeTranscript,
  type ParsedCombinedTranscript,
} from './transcript-parser.js';

// Block conversion
export {
  convertMessagesToBlocks,
  parseStreamEvent,
  sdkMessageToBlocks,
  sdkMessagesToBlocks,
  extractToolResultBlocks,
  createSubagentBlockFromToolUse,
} from './block-converter.js';
