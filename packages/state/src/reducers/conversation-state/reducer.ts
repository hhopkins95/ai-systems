/**
 * Session Conversation State Reducer
 *
 * A shared, immutable reducer for session conversation state.
 * Used by both server (SessionState) and client (React reducer).
 *
 * Key events:
 * - block:upsert - Create or update a block (merge semantics for existing, create with defaults for new)
 * - block:delta - Append content to a block
 * - subagent:spawned/completed - Subagent lifecycle
 * - session:idle - Finalize pending blocks
 *
 * Returns new state objects (never mutates).
 */

import type { AnySessionEvent } from '@ai-systems/shared-types';
import type { SessionConversationState } from './types.js';
import {
  handleBlockUpsert,
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
 * import { reduceSessionEvent, createInitialState } from '@ai-systems/state';
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
    // Primary block event
    case 'block:upsert':
      return handleBlockUpsert(state, event);

    case 'block:delta':
      return handleBlockDelta(state, event);

    // Subagent events
    case 'subagent:spawned':
      return handleSubagentSpawned(state, event);

    case 'subagent:completed':
      return handleSubagentCompleted(state, event);

    // Session lifecycle
    case 'session:idle': {
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
    'block:upsert',
    'block:delta',
    'subagent:spawned',
    'subagent:completed',
    'session:idle',
  ].includes(event.type);
}
