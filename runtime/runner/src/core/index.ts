/**
 * Core functions for agent runner.
 *
 * These are pure business logic functions that can be called directly
 * without subprocess spawning.
 */

export { executeQuery } from './execute-query.js';
export { executeClaudeQuery } from './execute-claude-query.js';
export { executeOpencodeQuery } from './execute-opencode-query.js';

export {
  loadAgentProfile,
  type LoadAgentProfileInput,
  type LoadAgentProfileResult,
} from './load-agent-profile.js';

export {
  loadSessionTranscript,
  type LoadSessionTranscriptInput,
  type LoadSessionTranscriptResult,
} from './load-session-transcript.js';

export {
  readSessionTranscript,
  type ReadSessionTranscriptInput,
  type ReadSessionTranscriptResult,
} from './read-session-transcript.js';

export type {
  ExecuteQueryInput,
  UserMessage,
} from './types.js';

// Execution event helpers
export {
  createLogEvent,
  createErrorEvent,
  createStatusEvent,
  errorEventFromError,
} from '../helpers/create-stream-events.js';
