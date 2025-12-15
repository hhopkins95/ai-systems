/**
 * Load Agent Profile CLI Command
 *
 * Thin wrapper that reads input from stdin, calls core function,
 * and writes output to stdout.
 */

import {
  loadAgentProfile as loadAgentProfileCore,
  type LoadAgentProfileInput,
} from '../../core/index.js';
import { readStdinJson } from '../shared/input.js';
import { writePlainError, writeLog, writeOutput } from '../shared/output.js';
import { setupExceptionHandlers } from '../shared/signal-handlers.js';

// Set up exception handlers early
setupExceptionHandlers();

export async function loadAgentProfile(): Promise<void> {
  try {
    const input = await readStdinJson<LoadAgentProfileInput>();

    writeLog('info', 'Loading agent profile', {
      baseWorkspacePath: input.baseWorkspacePath,
      architecture: input.architectureType,
    });

    const result = await loadAgentProfileCore(input);

    if (!result.success) {
      const errorMsg = result.errors?.join(', ') || 'Unknown error';
      writeOutput({ success: false, error: errorMsg });
      process.exit(1);
    }

    if (input.agentProfile.plugins && input.agentProfile.plugins.length > 0) {
      writeLog('info', 'Plugins installed', { count: input.agentProfile.plugins.length });
    }

    writeLog('info', 'Agent profile loaded');
    writeOutput({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    writeOutput({ success: false, error: errorMessage });
    process.exit(1);
  }
}
