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
import { writeJson, writeLog } from '../shared/output.js';
import { setupExceptionHandlers } from '../shared/signal-handlers.js';

// Set up exception handlers early
setupExceptionHandlers();

export async function loadSessionTranscript(): Promise<void> {
  try {
    const input = await readStdinJson<LoadSessionTranscriptInput>();

    writeLog('info', 'Loading session transcript', {
      sessionId: input.sessionId,
      architecture: input.architectureType,
    });

    const result = await loadSessionTranscriptCore(input);

    writeLog('info', 'Session transcript loaded');

    writeJson({
      success: result.success,
      errors: result.errors,
    });

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    writeJson({
      success: false,
      errors: [errorMessage],
    });

    process.exit(1);
  }
}
