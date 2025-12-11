/**
 * Core process runner - spawns runner subprocess and handles I/O
 *
 * This mimics how the execution environment invokes runners:
 * - Spawn subprocess with node dist/runner.js <command>
 * - Pipe JSON input to stdin
 * - Read stdout (JSONL for streaming, JSON for others)
 */

import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { StreamEvent } from '@ai-systems/shared-types';
import type { RunnerOptions, RunnerResult } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Path to the built runner.js (relative to this file in dist)
const RUNNER_PATH = join(__dirname, '../../../dist/runner.js');

// Default timeout: 5 minutes
const DEFAULT_TIMEOUT = 300000;

/**
 * Run a runner command as a subprocess
 *
 * @param options - Runner options including command, input, and callbacks
 * @returns Promise resolving to runner result with stdout/stderr
 */
export async function runRunner(options: RunnerOptions): Promise<RunnerResult> {
  const { command, input, cwd, timeout = DEFAULT_TIMEOUT, onEvent } = options;
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const proc = spawn('node', [RUNNER_PATH, command], {
      cwd: cwd || process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });

    // Write input to stdin and close
    proc.stdin.write(JSON.stringify(input));
    proc.stdin.end();

    // Collect output
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    // Buffer for incomplete lines (for JSONL parsing)
    let lineBuffer = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdoutChunks.push(text);

      // For streaming, parse and emit events as they arrive
      if (onEvent) {
        lineBuffer += text;
        const lines = lineBuffer.split('\n');

        // Keep the last potentially incomplete line in the buffer
        lineBuffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const event = JSON.parse(line) as StreamEvent;
              onEvent(event);
            } catch {
              // Ignore malformed lines during streaming
            }
          }
        }
      }
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk.toString());
    });

    // Handle timeout
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`Runner timed out after ${timeout}ms`));
    }, timeout);

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on('close', (code) => {
      clearTimeout(timer);

      // Process any remaining buffered content
      if (onEvent && lineBuffer.trim()) {
        try {
          const event = JSON.parse(lineBuffer) as StreamEvent;
          onEvent(event);
        } catch {
          // Ignore
        }
      }

      const stdout = stdoutChunks.join('');
      const stderr = stderrChunks.join('');

      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
        duration: Date.now() - startTime,
      });
    });
  });
}

/**
 * Get the path to the runner script
 * Useful for debugging or validation
 */
export function getRunnerPath(): string {
  return RUNNER_PATH;
}
