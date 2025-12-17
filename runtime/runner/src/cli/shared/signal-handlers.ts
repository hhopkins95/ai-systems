/**
 * Signal handling utilities for CLI scripts
 *
 * Provides graceful shutdown handling for SIGINT and SIGTERM signals.
 */

import { writePlainError } from './output.js';

/**
 * Cleanup function type
 */
export type CleanupFunction = () => void | Promise<void>;

/**
 * Set up process signal handlers for graceful shutdown
 *
 * @param cleanup - Optional async cleanup function to run before exit
 */
export function setupSignalHandlers(cleanup?: CleanupFunction): void {
  const handleSignal = async (signal: NodeJS.Signals, exitCode: number) => {
    writePlainError(`Execution interrupted by ${signal}`);

    if (cleanup) {
      try {
        await cleanup();
      } catch (err) {
        console.error(`Cleanup failed: ${err}`);
      }
    }

    process.exit(exitCode);
  };

  process.on('SIGINT', () => handleSignal('SIGINT', 130));
  process.on('SIGTERM', () => handleSignal('SIGTERM', 143));
}

/**
 * Set up uncaught exception handler
 */
export function setupExceptionHandlers(): void {
  process.on('uncaughtException', (error) => {
    writePlainError(error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    writePlainError(error);
    process.exit(1);
  });
}
