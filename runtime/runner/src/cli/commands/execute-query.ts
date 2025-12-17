/**
 * Execute Query CLI Command
 *
 * Reads input from stdin, dispatches to the appropriate SDK implementation,
 * and writes output to stdout.
 */

import { executeClaudeQuery } from '../../core/execute-claude-query.js';
import { executeOpencodeQuery } from '../../core/execute-opencode-query.js';
import type { ExecuteQueryArgs } from '../../types.js';
import { readStdinJson } from '../shared/input.js';
import { emitSessionEvent, emitLog, emitError } from '../shared/output.js';
import { setupSignalHandlers, setupExceptionHandlers } from '../shared/signal-handlers.js';

// Set up exception handlers early
setupExceptionHandlers();

export async function executeQuery(): Promise<void> {
  // Read input from stdin
  const input = await readStdinJson<ExecuteQueryArgs>();

  emitLog('info', 'Executing query', {
    architecture: input.architecture,
    sessionId: input.sessionId,
    baseWorkspacePath: input.baseWorkspacePath,
  });

  // Setup default signal handlers
  setupSignalHandlers();

  try {
    // Dispatch to appropriate SDK implementation
    if (input.architecture === 'claude-sdk') {
      for await (const event of executeClaudeQuery(input)) {
        emitSessionEvent(event);
      }
    } else if (input.architecture === 'opencode') {
      for await (const event of executeOpencodeQuery(input)) {
        emitSessionEvent(event);
      }
    } else {
      throw new Error(`Unknown architecture: ${input.architecture}`);
    }

    process.exit(0);
  } catch (error) {
    emitLog('error', 'Query execution failed', {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    emitError(
      error instanceof Error ? error.message : String(error),
      'QUERY_FAILED',
      error instanceof Error && error.stack ? { stack: error.stack } : undefined
    );
    process.exit(1);
  }
}
