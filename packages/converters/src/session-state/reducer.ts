/**
 * Session Conversation State Reducer
 *
 * A shared, immutable reducer for session conversation state.
 * Used by both server (SessionState) and client (React reducer).
 *
 * Handles:
 * - Block events: start, delta, update, complete
 * - Subagent events: spawned, completed
 *
 * Returns new state objects (never mutates).
 */

import type { AnySessionEvent } from '@ai-systems/shared-types';
import type { SessionConversationState } from './types.js';
import {
  handleBlockStart,
  handleBlockComplete,
  handleBlockUpdate,
  handleBlockDelta,
  handleSessionIdle,
} from './handlers/block-handlers.js';
import {
  handleSubagentSpawned,
  handleSubagentCompleted,
} from './handlers/subagent-handlers.js';

/**
 * Reduce a session event into new conversation state.
 *
 * This is the main entry point for the shared reducer.
 * All state transitions are immutable.
 *
 * @param state - Current conversation state
 * @param event - Session event to process
 * @returns New conversation state (or same state if event is unhandled)
 *
 * @example
 * ```typescript
 * import { reduceSessionEvent, createInitialState } from '@hhopkins/agent-converters';
 *
 * let state = createInitialState();
 * for (const event of events) {
 *   state = reduceSessionEvent(state, event);
 * }
 * ```
 */
export function reduceSessionEvent(
  state: SessionConversationState,
  event: AnySessionEvent
): SessionConversationState {
  switch (event.type) {
    // Block events
    case 'block:start':
      return handleBlockStart(state, event);

    case 'block:complete':
      return handleBlockComplete(state, event);

    case 'block:update':
      return handleBlockUpdate(state, event);

    case 'block:delta':
      return handleBlockDelta(state, event);

    // Subagent events
    case 'subagent:spawned':
      return handleSubagentSpawned(state, event);

    case 'subagent:completed':
      return handleSubagentCompleted(state, event);

    // Session lifecycle events
    case 'session:idle': {
      // Finalize streaming blocks for this conversation
      const conversationId = event.context.conversationId ?? 'main';
      return handleSessionIdle(state, conversationId);
    }

    // All other events don't affect conversation state
    default:
      return state;
  }
}

/**
 * Check if an event is handled by this reducer
 */
export function isConversationEvent(event: AnySessionEvent): boolean {
  return [
    'block:start',
    'block:complete',
    'block:update',
    'block:delta',
    'subagent:spawned',
    'subagent:completed',
    'session:idle',
  ].includes(event.type);
}
