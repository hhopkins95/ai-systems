/**
 * Load Session Transcript CLI Command
 *
 * Thin wrapper that reads input from stdin, calls core function,
 * and writes output to stdout.
 */

import {
  loadSessionTranscript as loadSessionTranscriptCore,
  type LoadSessionTranscriptInput,
} from '../../core/index.js';
import { readStdinJson } from '../shared/input.js';
import { writeOutput, emitLog } from '../shared/output.js';
import { setupExceptionHandlers } from '../shared/signal-handlers.js';

// Set up exception handlers early
setupExceptionHandlers();

export async function loadSessionTranscript(): Promise<void> {
  try {
    const input = await readStdinJson<LoadSessionTranscriptInput>();

    emitLog('info', 'Loading session transcript', {
      sessionId: input.sessionId,
      architecture: input.architectureType,
    });

    const result = await loadSessionTranscriptCore(input);

    if (!result.success) {
      const errorMsg = result.errors?.join(', ') || 'Unknown error';
      writeOutput({ success: false, error: errorMsg });
      process.exit(1);
    }

    emitLog('info', 'Session transcript loaded');
    writeOutput({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    writeOutput({ success: false, error: errorMessage });
    process.exit(1);
  }
}
