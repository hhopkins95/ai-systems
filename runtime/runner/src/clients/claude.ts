/**
 * Claude SDK client utilities.
 *
 * Provides lazy initialization and helper functions for Claude Code integration.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

let claudePathPromise: Promise<string> | null = null;

/**
 * Find the Claude Code executable in PATH.
 * Result is cached for subsequent calls.
 */
export async function findClaudeExecutable(): Promise<string> {
  if (!claudePathPromise) {
    claudePathPromise = (async () => {
      try {
        const { stdout } = await execAsync('which claude');
        const path = stdout.trim();
        if (!path) {
          throw new Error(
            'Claude Code executable not found in PATH. Install with: npm install -g @anthropic-ai/claude-code'
          );
        }
        return path;
      } catch {
        throw new Error(
          'Claude Code executable not found in PATH. Install with: npm install -g @anthropic-ai/claude-code'
        );
      }
    })();
  }
  return claudePathPromise;
}

/**
 * Reset the cached Claude executable path.
 * Useful for testing.
 */
export function resetClaudeExecutable(): void {
  claudePathPromise = null;
}
