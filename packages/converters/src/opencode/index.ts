/**
 * OpenCode Converters
 *
 * Functions for parsing OpenCode transcripts and converting
 * SDK events to ConversationBlocks and StreamEvents.
 */

// Transcript parsing
export {
  parseOpenCodeTranscriptFile,
  type OpenCodeSessionTranscript,
  type ParsedTranscript,
  type ParseTranscriptOptions,
} from './transcript-parser.js';

// Stream event conversion
export {
  createStreamEventParser,
  parseOpencodeStreamEvent,
  type ConvertOptions,
} from './block-converter.js';
