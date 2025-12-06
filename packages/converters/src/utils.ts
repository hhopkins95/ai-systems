/**
 * Shared utility functions for converters
 */

/**
 * Generate a unique ID for blocks that don't have UUIDs
 */
export function generateId(): string {
  return `block_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Convert Unix timestamp (ms) to ISO string
 */
export function toISOTimestamp(unixMs: number): string {
  return new Date(unixMs).toISOString();
}

/**
 * Simple logger interface for converters
 * Consumers can provide their own logger implementation
 */
export interface Logger {
  debug: (obj: Record<string, unknown>, msg?: string) => void;
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
}

/**
 * Default no-op logger
 */
export const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Console-like interface
 */
interface ConsoleInterface {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/**
 * Create a console-based logger
 * Consumers should call this with their console object
 */
export function createConsoleLogger(console: ConsoleInterface): Logger {
  return {
    debug: (obj, msg) => console.debug(msg, obj),
    info: (obj, msg) => console.info(msg, obj),
    warn: (obj, msg) => console.warn(msg, obj),
    error: (obj, msg) => console.error(msg, obj),
  };
}
