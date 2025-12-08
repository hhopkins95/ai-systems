/**
 * Claude SDK Converters
 *
 * Functions for parsing Claude SDK transcripts and converting
 * SDK messages to ConversationBlocks and StreamEvents.
 */

// Transcript parsing
export {
  parseClaudeTranscriptFile,
  extractSubagentId,
  detectSubagentStatus,
  parseCombinedClaudeTranscript,
  type ParseTranscriptOptions,
  type CombinedClaudeTranscript,
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
  type ConvertOptions,
} from './block-converter.js';
