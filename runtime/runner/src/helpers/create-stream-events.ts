/**
 * Execution Event Helpers
 *
 * Factory functions for creating execution-level StreamEvents.
 * These events are operational (logs, errors, status) not conversation blocks.
 */

import type {
  LogEvent,
  ErrorEvent,
  StatusEvent,
  ExecutionEnvironmentStatus,
} from '@ai-systems/shared-types';

/**
 * Create a log event
 */
export function createLogEvent(
  message: string,
  level?: 'debug' | 'info' | 'warn' | 'error',
  data?: Record<string, unknown>
): LogEvent {
  return {
    type: 'log',
    level,
    message,
    data,
  };
}

/**
 * Create an error event
 */
export function createErrorEvent(
  message: string,
  code?: string,
  data?: Record<string, unknown>
): ErrorEvent {
  return {
    type: 'error',
    message,
    code,
    data,
  };
}

/**
 * Create a status event
 */
export function createStatusEvent(
  status: ExecutionEnvironmentStatus,
  message?: string
): StatusEvent {
  return {
    type: 'status',
    status,
    message,
  };
}

/**
 * Helper to create an error event from an Error object
 */
export function errorEventFromError(
  error: unknown,
  code?: string
): ErrorEvent {
  const message = error instanceof Error ? error.message : String(error);
  const data = error instanceof Error && error.stack
    ? { stack: error.stack }
    : undefined;

  return createErrorEvent(message, code, data);
}
