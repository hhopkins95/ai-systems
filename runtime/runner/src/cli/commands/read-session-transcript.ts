/**
 * Read Session Transcript CLI Command
 *
 * Thin wrapper that reads input from stdin, calls core function,
 * and writes output to stdout.
 */

import {
  readSessionTranscript as readSessionTranscriptCore,
  type ReadSessionTranscriptInput,
} from '../../core/index.js';
import { readStdinJson } from '../shared/input.js';
import { writeOutput } from '../shared/output.js';
import { setupSignalHandlers, setupExceptionHandlers } from '../shared/signal-handlers.js';

// Set up exception handlers early
setupExceptionHandlers();

export async function readSessionTranscript(): Promise<void> {
  // Read input from stdin
  const input = await readStdinJson<ReadSessionTranscriptInput>();

  // Setup signal handlers
  setupSignalHandlers();

  try {
    const result = await readSessionTranscriptCore(input);

    if (!result.success || !result.transcript) {
      const errorMsg = result.error || `No transcript found for session: ${input.sessionId}`;
      writeOutput({ success: false, error: errorMsg });
      process.exit(1);
    }

    writeOutput({ success: true, data: { transcript: result.transcript } });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    writeOutput({ success: false, error: errorMessage });
    process.exit(1);
  }
}
