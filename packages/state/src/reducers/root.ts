/**
 * Root Session State Reducer
 *
 * Composes all session state reducers into a single root reducer.
 * This is the main entry point for state management.
 *
 * Architecture:
 * - Conversation reducer: Handles blocks, subagents, streaming state
 * - Runtime reducer: Handles session lifecycle, queries, execution environment
 *
 * All events are forwarded to all reducers. Each reducer returns the same
 * state reference if the event doesn't affect its state slice.
 */

import type {
  AnySessionEvent,
  SessionConversationState,
  SessionState,
} from '@ai-systems/shared-types';
import { reduceSessionEvent as reduceConversationEvent } from './conversation/reducer.js';
import { reduceRuntimeEvent } from './runtime/reducer.js';
import { createInitialConversationState } from './conversation/types.js';
import { createInitialRuntimeState } from './runtime/types.js';
import { reduceExecutionEnvironmentEvent } from './execution-environment/reducer.js';

/**
 * Create initial combined session state.
 */
export function createInitialSessionState(): SessionState {
  return {
    executionEnvironment: { status: 'inactive' },
    conversation: createInitialConversationState(),
    runtime: createInitialRuntimeState(),
  };
}

/**
 * Root reducer - composes all state reducers.
 *
 * All events are forwarded to all reducers. Each reducer is responsible
 * for returning the same state reference if the event doesn't affect it.
 *
 * @param state - Current combined session state
 * @param event - Session event to process
 * @returns New combined state
 *
 * @example
 * ```typescript
 * import { reduceSessionState, createInitialSessionState } from '@ai-systems/state';
 *
 * let state = createInitialSessionState();
 * for (const event of events) {
 *   state = reduceSessionState(state, event);
 * }
 * ```
 */
export function reduceSessionState(
  state: SessionState,
  event: AnySessionEvent
): SessionState {
  const newConversation = reduceConversationEvent(state.conversation, event);
  const newRuntime = reduceRuntimeEvent(state.runtime, event);
  const newExecutionEnvironment = reduceExecutionEnvironmentEvent(state.executionEnvironment, event);
  // Optimization: return same reference if nothing changed
  if (
    newConversation === state.conversation &&
    newRuntime === state.runtime
  ) {
    return state;
  }

  return {
    conversation: newConversation,
    executionEnvironment: newExecutionEnvironment ?? state.executionEnvironment,
    runtime: newRuntime,
  };
}
