/**
 * Shared output utilities for CLI scripts
 *
 * Provides consistent JSONL output formatting for StreamEvents
 * and result objects.
 */

import type { StreamEvent, SystemBlock } from '@ai-systems/shared-types';
import type { SetupSessionResult } from '../../types.js';

/**
 * Write a StreamEvent as JSONL to stdout
 */
export function writeStreamEvent(event: StreamEvent): void {
  console.log(JSON.stringify(event));
  // Flush stdout for immediate delivery
  process.stdout.write('');
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

  console.log(JSON.stringify(event));
}

/**
 * Write a setup result as JSON to stdout
 */
export function writeSetupResult(result: SetupSessionResult): void {
  console.log(JSON.stringify(result));
}

/**
 * Write a generic JSON object to stdout
 */
export function writeJson(obj: unknown): void {
  console.log(JSON.stringify(obj));
}

/**
 * Write to stderr (for logging that shouldn't interfere with JSONL output)
 */
export function logDebug(message: string, data?: Record<string, unknown>): void {
  if (process.env.DEBUG) {
    console.error(JSON.stringify({ message, ...data, timestamp: new Date().toISOString() }));
  }
}
