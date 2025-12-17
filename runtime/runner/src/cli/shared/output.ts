/**
 * Shared output utilities for CLI scripts
 *
 * Provides consistent JSONL output formatting for SessionEvents.
 * All events are emitted in the unified format: { type, payload, context }
 */

import type {
  AnySessionEvent,
  SessionEventType,
  SessionEventPayloads,
  SessionEventContext,
  ScriptOutput,
} from '@ai-systems/shared-types';
import { createSessionEvent } from '@ai-systems/shared-types';

// =============================================================================
// New SessionEvent Output Functions
// =============================================================================

/**
 * Emit a SessionEvent as JSONL to stdout
 *
 * Uses process.stdout.write directly for unbuffered output in non-TTY environments.
 */
export function emitSessionEvent(event: AnySessionEvent): void {
  process.stdout.write(JSON.stringify(event) + '\n');
}

/**
 * Emit multiple SessionEvents
 */
export function emitSessionEvents(events: AnySessionEvent[]): void {
  for (const event of events) {
    emitSessionEvent(event);
  }
}

/**
 * Create and emit a SessionEvent in one call
 *
 * @param type - The event type
 * @param payload - The event payload
 * @param context - Partial context (source defaults to 'runner')
 */
export function emitEvent<K extends SessionEventType>(
  type: K,
  payload: SessionEventPayloads[K],
  context: Partial<SessionEventContext> = {}
): void {
  const event = createSessionEvent(type, payload, {
    source: 'runner',
    ...context,
  });
  // Cast is safe because SessionEvent<K> is a specific instance of AnySessionEvent
  emitSessionEvent(event as AnySessionEvent);
}

/**
 * Emit a log event
 */
export function emitLog(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  data?: Record<string, unknown>
): void {
  emitEvent('log', { level, message, data });
}

/**
 * Emit an error event
 */
export function emitError(
  message: string,
  code?: string,
  data?: Record<string, unknown>
): void {
  emitEvent('error', { message, code, data });
}

/**
 * Write a script output result
 *
 * Script outputs are special - they're the final result of non-streaming commands.
 * These still use the old ScriptOutput format for backwards compatibility with
 * the server's consumeRunnerOutput() method.
 */
export function writeOutput<T>(
  result: { success: true; data?: T } | { success: false; error: string }
): void {
  const output: ScriptOutput<T> = {
    type: 'script_output',
    ...result,
  };
  process.stdout.write(JSON.stringify(output) + '\n');
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Write an error as plain text to stderr (for subprocess error handling)
 */
export function writePlainError(error: Error | string): void {
  const errorMessage = typeof error === 'string' ? error : error.message;
  console.error(errorMessage);
}

/**
 * Write to stderr (for logging that shouldn't interfere with JSONL output)
 */
export function logDebug(message: string, data?: Record<string, unknown>): void {
  if (process.env.DEBUG) {
    console.error(JSON.stringify({ message, ...data, timestamp: new Date().toISOString() }));
  }
}
