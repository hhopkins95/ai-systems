/**
 * Internal types for converter functions
 *
 * These types are used by the converter implementations and are not
 * intended for domain-level consumption (use @ai-systems/shared-types instead).
 */

import type { Logger } from './utils.js';

/**
 * Options for block conversion functions
 */
export interface ConvertOptions {
  logger?: Logger;
}

/**
 * Options for transcript parsing functions
 */
export interface ParseTranscriptOptions {
  logger?: Logger;
}
