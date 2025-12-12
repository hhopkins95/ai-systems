/**
 * Execute Query CLI Command
 *
 * Thin wrapper that reads input from stdin, calls core function,
 * and writes output to stdout.
 */

import { executeQuery as executeQueryCore } from '../../core/index.js';
import type { ExecuteQueryArgs } from '../../types.js';
import { readStdinJson } from '../shared/input.js';
import { writeStreamEvent, writeError, writeLog } from '../shared/output.js';
import { setupSignalHandlers, setupExceptionHandlers } from '../shared/signal-handlers.js';

// Set up exception handlers early
setupExceptionHandlers();

export async function executeQuery(): Promise<void> {
  // Read input from stdin
  const input = await readStdinJson<ExecuteQueryArgs>();

  writeStreamEvent({
    type: 'log',
    level: 'info',
    message: 'Executing query',
    data: {
    architecture: input.architecture,
    sessionId: input.sessionId,
    cwd: input.cwd,
  }});

  // Setup default signal handlers
  setupSignalHandlers();

  try {
    for await (const event of executeQueryCore(input)) {
      writeStreamEvent(event);
    }

    process.exit(0);
  } catch (error) {
    writeLog('error', 'Query execution failed', {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    writeError(error as Error);
    process.exit(1);
  }
}
