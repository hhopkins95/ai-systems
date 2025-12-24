/**
 * Execution Environment State Reducer
 *
 * A shared, immutable reducer for execution environment state.
 * Used by both server (SessionState) and client (React reducer).
 *
 * Key events:
 * - ee:creating - Environment creation starting
 * - ee:ready - Environment fully initialized
 * - ee:terminated - Environment shut down
 * - ee:error - Environment encountered an error
 * - ee:health_check - Health check received
 *
 * Returns new state objects (never mutates).
 */

import type { AnySessionEvent, ExecutionEnvironmentState } from '@ai-systems/shared-types';
import { createInitialExecutionEnvironmentState } from './types.js';

/**
 * Reduce a session event into new execution environment state.
 *
 * @param state - Current EE state (null if no environment exists)
 * @param event - Session event to process
 * @returns New EE state (or same state if event is unhandled)
 */
export function reduceExecutionEnvironmentEvent(
  state: ExecutionEnvironmentState | null,
  event: AnySessionEvent
): ExecutionEnvironmentState | null {
  switch (event.type) {
    case 'ee:creating':
      return {
        ...createInitialExecutionEnvironmentState(),
        status: 'starting',
        statusMessage: event.payload.statusMessage,
      };

    case 'ee:ready':
      // If no state exists, create one (shouldn't happen normally)
      if (!state) {
        return {
          status: 'ready',
          id: event.payload.eeId,
        };
      }
      return {
        ...state,
        status: 'ready',
        id: event.payload.eeId,
        statusMessage: undefined,
      };

    case 'ee:terminated':
      if (!state) return null;
      return {
        ...state,
        status: 'terminated',
        statusMessage: `Terminated: ${event.payload.reason}`,
      };

    case 'ee:error':
      // If no state exists, create one in error state
      if (!state) {
        return {
          status: 'error',
          lastError: {
            message: event.payload.message,
            code: event.payload.code,
            timestamp: Date.now(),
          },
        };
      }
      return {
        ...state,
        status: 'error',
        lastError: {
          message: event.payload.message,
          code: event.payload.code,
          timestamp: Date.now(),
        },
      };

    case 'ee:health_check':
      if (!state) return state;
      return {
        ...state,
        lastHealthCheck: event.payload.timestamp,
      };

    default:
      return state;
  }
}

/**
 * Check if an event is handled by this reducer
 */
export function isExecutionEnvironmentEvent(event: AnySessionEvent): boolean {
  return [
    'ee:creating',
    'ee:ready',
    'ee:terminated',
    'ee:error',
    'ee:health_check',
  ].includes(event.type);
}
