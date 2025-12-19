/**
 * Claude SDK Converters
 *
 * Functions for parsing Claude SDK transcripts and converting
 * SDK messages to SessionEvents.
 *
 * Main entry points:
 * - sdkMessageToEvents: Convert SDK message to SessionEvents (for streaming)
 * - parseCombinedClaudeTranscript: Parse transcript to SessionConversationState
 */

// Re-export shared types
export type { ConvertOptions, ParseTranscriptOptions } from '../types.js';
export type { CombinedClaudeTranscript, SessionConversationState } from '@ai-systems/shared-types';

// Transcript parsing
export {
  parseClaudeTranscriptFile,
  extractSubagentId,
  detectSubagentStatus,
  parseCombinedClaudeTranscript,
} from './transcript-parser.js';

// SDK message to events conversion
export { sdkMessageToEvents } from './block-converter.js';
