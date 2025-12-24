/**
 * OpenCode Converters
 *
 * Functions for parsing OpenCode transcripts and converting
 * SDK events to ConversationBlocks and SessionEvents.
 */

// Re-export shared types
export type { ConvertOptions, ParseTranscriptOptions } from '../../types.js';
export type { SessionConversationState } from '@ai-systems/shared-types';

// Transcript parsing
export {
  parseOpenCodeTranscriptFile,
  parseCombinedOpenCodeTranscript,
} from './transcript-parser.js';

// Re-export transcript types from shared-types
export type { OpenCodeSessionTranscript, CombinedOpenCodeTranscript } from '@ai-systems/shared-types';

// Stream event conversion (primary API)
export {
  createOpenCodeEventConverter,
  type OpenCodeEventConverter,
} from './block-converter.js';

// Shared helpers (for advanced use cases)
export {
  mapToBlockStatus,
  getPartTimestamp,
  isTaskTool,
  extractSubagentSessionIds,
  extractSubagentBlock,
  extractSubagentFromTaskTool,
  partToBlocks,
  partToEvents,
  taskToolToEvents,
} from './shared-helpers.js';
