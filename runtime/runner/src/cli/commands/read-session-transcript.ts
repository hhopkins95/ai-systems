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
import { writeError } from '../shared/output.js';
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
      throw new Error(result.error || `No transcript found for session: ${input.sessionId}`);
    }

    // Write the transcript to stdout
    process.stdout.write(result.transcript);

    process.exit(0);
  } catch (error) {
    writeError(error as Error);
    process.exit(1);
  }
}
