/**
 * Session Event Helpers
 *
 * Factory functions for creating session events from the runner.
 * These events use the unified SessionEvent format with type + payload + context.
 */

import {
  createSessionEvent,
  type SessionEvent,
  type LogLevel,
} from '@ai-systems/shared-types';

/**
 * Create a log session event
 */
export function createLogSessionEvent(
  message: string,
  level?: LogLevel,
  data?: Record<string, unknown>
): SessionEvent<'log'> {
  return createSessionEvent('log', { level, message, data }, { source: 'runner' });
}

/**
 * Create an error session event
 */
export function createErrorSessionEvent(
  message: string,
  code?: string,
  data?: Record<string, unknown>
): SessionEvent<'error'> {
  return createSessionEvent('error', { message, code, data }, { source: 'runner' });
}

/**
 * Helper to create an error event from an Error object
 */
export function errorSessionEventFromError(
  error: unknown,
  code?: string
): SessionEvent<'error'> {
  const message = error instanceof Error ? error.message : String(error);
  const data = error instanceof Error && error.stack
    ? { stack: error.stack }
    : undefined;

  return createErrorSessionEvent(message, code, data);
}
