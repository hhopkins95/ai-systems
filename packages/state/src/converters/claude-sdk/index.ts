/**
 * Claude SDK Converters
 *
 * Functions for parsing Claude SDK transcripts and converting
 * SDK messages to SessionEvents.
 *
 * Main entry points:
 * - createClaudeSdkEventConverter: Create stateful converter for streaming
 * - parseCombinedClaudeTranscript: Parse transcript to SessionConversationState
 */

// Re-export shared types
export type { ConvertOptions, ParseTranscriptOptions } from '../../types.js';
export type { CombinedClaudeTranscript, SessionConversationState } from '@ai-systems/shared-types';

// Transcript parsing
export {
  parseClaudeTranscriptFile,
  parseCombinedClaudeTranscript,
} from './transcript-parser.js';

// SDK message to events conversion
export { createClaudeSdkEventConverter } from './block-converter.js';
export type { ClaudeSdkEventConverter } from './block-converter.js';
