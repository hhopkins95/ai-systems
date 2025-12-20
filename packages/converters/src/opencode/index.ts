/**
 * OpenCode Converters
 *
 * Functions for parsing OpenCode transcripts and converting
 * SDK events to ConversationBlocks and SessionEvents.
 */

// Re-export shared types
export type { ConvertOptions, ParseTranscriptOptions } from '../types.js';
export type { SessionConversationState } from '@ai-systems/shared-types';

// Transcript parsing
export {
  parseOpenCodeTranscriptFile,
  type OpenCodeSessionTranscript,
} from './transcript-parser.js';

// Stream event conversion (primary API)
export {
  createStreamEventParser,
  opencodeEventToSessionEvents,
} from './block-converter.js';

// Deprecated exports for backward compatibility
export {
  parseOpencodeStreamEvent,
} from './block-converter.js';

// Shared helpers (for advanced use cases)
export {
  mapToolStatus,
  getPartTimestamp,
  isTaskTool,
  extractSubagentBlock,
  extractSubagentFromTaskTool,
  partToBlocks,
  partToEvents,
  taskToolToEvents,
} from './shared-helpers.js';
