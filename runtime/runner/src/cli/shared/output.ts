/**
 * Shared output utilities for CLI scripts
 *
 * Provides consistent JSONL output formatting for StreamEvents
 * and result objects.
 */

import type { StreamEvent, SystemBlock, ScriptOutput } from '@ai-systems/shared-types';

/**
 * Write a StreamEvent as JSONL to stdout
 * Uses process.stdout.write directly for unbuffered output in non-TTY environments
 */
export function writeStreamEvent(event: StreamEvent): void {
  // Use write() instead of console.log() to avoid buffering in non-TTY (e.g., Modal containers)
  process.stdout.write(JSON.stringify(event) + '\n');
}

/**
 * Write multiple StreamEvents
 */
export function writeStreamEvents(events: StreamEvent[]): void {
  for (const event of events) {
    writeStreamEvent(event);
  }
}

/**
 * Write an error as a system error StreamEvent
 */
export function writeError(error: Error | string): void {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const errorName = error instanceof Error ? error.name : 'Error';
  const blockId = `error-${Date.now()}`;

  const systemBlock: SystemBlock = {
    type: 'system',
    id: blockId,
    timestamp: new Date().toISOString(),
    subtype: 'error',
    message: errorMessage,
    metadata: {
      name: errorName,
      stack: error instanceof Error ? error.stack : undefined,
    },
  };

  const event: StreamEvent = {
    type: 'block_complete',
    blockId,
    conversationId: 'main',
    block: systemBlock,
  };

  console.error(JSON.stringify(event));
}

/**
 * Write an error as plain text to stderr (for subprocess error handling)
 */
export function writePlainError(error: Error | string): void {
  const errorMessage = typeof error === 'string' ? error : error.message;
  console.error(errorMessage);
}


/**
 * Write a generic JSON object to stdout
 * @deprecated Use writeOutput() for script results
 */
export function writeJson(obj: unknown): void {
  console.log(JSON.stringify(obj));
}

/**
 * Write a script output result as a ScriptOutput StreamEvent
 *
 * Use this for the final result of non-streaming commands.
 * The data type T should match what the consumer expects.
 */
export function writeOutput<T>(result: { success: true; data?: T } | { success: false; error: string }): void {
  const output: ScriptOutput<T> = {
    type: 'script_output',
    ...result,
  };
  process.stdout.write(JSON.stringify(output) + '\n');
}

/**
 * Write to stderr (for logging that shouldn't interfere with JSONL output)
 */
export function logDebug(message: string, data?: Record<string, unknown>): void {
  if (process.env.DEBUG) {
    console.error(JSON.stringify({ message, ...data, timestamp: new Date().toISOString() }));
  }
}

/**
 * Log levels for runner logs
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Write a log message as a StreamEvent
 *
 * Outputs log events to stdout as JSONL, consistent with other StreamEvents.
 * The server reads stdout and forwards log events to the server logger.
 */
export function writeLog(
  level: LogLevel,
  message: string,
  data?: Record<string, unknown>
): void {
  const blockId = `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const systemBlock: SystemBlock = {
    type: 'system',
    id: blockId,
    timestamp: new Date().toISOString(),
    subtype: 'log',
    message,
    metadata: { level, ...data },
  };

  const event: StreamEvent = {
    type: 'block_complete',
    blockId,
    conversationId: 'main',
    block: systemBlock,
  };

  // Write to stdout as JSONL (consistent with other StreamEvents)
  process.stdout.write(JSON.stringify(event) + '\n');
}
