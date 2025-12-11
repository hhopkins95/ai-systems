/**
 * Input resolver - resolves input from files, inline JSON, or stdin
 */

import { readFile } from 'fs/promises';
import { createInterface } from 'readline';

/**
 * Options for resolving input
 */
export interface InputOptions {
  /** Path to JSON input file */
  inputFile?: string;
  /** Inline JSON string */
  inline?: string;
}

/**
 * Resolve input from various sources
 *
 * Priority:
 * 1. --input <file.json> - Read from file
 * 2. --inline '{"..."}' - Parse inline JSON
 * 3. stdin - Read from stdin if piped
 *
 * @param options - Input resolution options
 * @returns Parsed input object
 */
export async function resolveInput<T extends object>(
  options: InputOptions
): Promise<T> {
  const { inputFile, inline } = options;

  // Priority 1: Input file
  if (inputFile) {
    const content = await readFile(inputFile, 'utf-8');
    return JSON.parse(content) as T;
  }

  // Priority 2: Inline JSON
  if (inline) {
    return JSON.parse(inline) as T;
  }

  // Priority 3: Check if stdin is piped (not a TTY)
  if (!process.stdin.isTTY) {
    const content = await readStdin();
    if (content.trim()) {
      return JSON.parse(content) as T;
    }
  }

  // No input provided - return empty object
  return {} as T;
}

/**
 * Read all content from stdin
 */
async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: string[] = [];
    const rl = createInterface({
      input: process.stdin,
      terminal: false,
    });

    rl.on('line', (line) => {
      chunks.push(line);
    });

    rl.on('close', () => {
      resolve(chunks.join('\n'));
    });

    // Set a short timeout in case stdin is empty but not closed
    setTimeout(() => {
      rl.close();
    }, 100);
  });
}

/**
 * Merge input with command-line overrides
 *
 * @param base - Base input object (from file/inline/stdin)
 * @param overrides - Command-line overrides (only non-undefined values)
 * @returns Merged input object
 */
export function mergeInput<T extends object>(
  base: T,
  overrides: Partial<T>
): T {
  const result = { ...base };

  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      (result as Record<string, unknown>)[key] = value;
    }
  }

  return result;
}
