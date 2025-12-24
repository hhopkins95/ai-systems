/**
 * Session Runtime State Reducer
 *
 * A shared, immutable reducer for session runtime state.
 * Used by both server (SessionState) and client (React reducer).
 *
 * Key events:
 * - session:initialized - Session loaded
 * - query:started - Query execution started
 * - query:completed - Query completed successfully
 * - query:failed - Query failed with error
 * - session:idle - Session became idle (clears active query)
 * - ee:* events - Delegated to execution environment reducer
 *
 * Returns new state objects (never mutates).
 */

import type { AnySessionEvent, SessionRuntimeState } from '@ai-systems/shared-types';
import {
  reduceExecutionEnvironmentEvent,
  isExecutionEnvironmentEvent,
} from '../execution-environment/reducer.js';

/**
 * Reduce a session event into new runtime state.
 *
 * @param state - Current runtime state
 * @param event - Session event to process
 * @returns New runtime state (or same state if event is unhandled)
 */
export function reduceRuntimeEvent(
  state: SessionRuntimeState,
  event: AnySessionEvent
): SessionRuntimeState {
  // Delegate EE events to the EE reducer
  if (isExecutionEnvironmentEvent(event)) {
    const newEEState = reduceExecutionEnvironmentEvent(
      state.executionEnvironment,
      event
    );
    if (newEEState === state.executionEnvironment) {
      return state;
    }
    return {
      ...state,
      executionEnvironment: newEEState,
    };
  }

  switch (event.type) {
    case 'session:initialized':
      return {
        ...state,
        isLoaded: true,
      };

    case 'query:started':
      return {
        ...state,
        activeQuery: {
          startedAt: Date.now(),
        },
      };

    case 'query:completed':
    case 'query:failed':
    case 'session:idle':
      // Clear active query on completion, failure, or idle
      if (!state.activeQuery) {
        return state;
      }
      return {
        ...state,
        activeQuery: undefined,
      };

    default:
      return state;
  }
}

/**
 * Check if an event is handled by this reducer
 */
export function isRuntimeEvent(event: AnySessionEvent): boolean {
  return (
    isExecutionEnvironmentEvent(event) ||
    [
      'session:initialized',
      'query:started',
      'query:completed',
      'query:failed',
      'session:idle',
    ].includes(event.type)
  );
}
