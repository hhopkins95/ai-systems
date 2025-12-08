/**
 * OpenCode Converters
 *
 * Functions for parsing OpenCode transcripts and converting
 * SDK events to ConversationBlocks and StreamEvents.
 */

// Re-export shared types
export type { ConvertOptions, ParseTranscriptOptions } from '../types.js';
export type { ParsedTranscript } from '@ai-systems/shared-types';

// Transcript parsing
export {
  parseOpenCodeTranscriptFile,
  type OpenCodeSessionTranscript,
} from './transcript-parser.js';

// Stream event conversion
export {
  createStreamEventParser,
  parseOpencodeStreamEvent,
} from './block-converter.js';
