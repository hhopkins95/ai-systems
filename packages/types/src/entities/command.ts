/**
 * Command entity types
 */

import type { EntitySource } from "../sources.js";

/**
 * Command metadata from YAML frontmatter
 */
export interface CommandMetadata {
  /** Command description */
  description?: string;
  /** Agent to use for this command */
  agent?: string;
  /** Model to use */
  model?: string;
  /** Tools this command is allowed to use */
  allowedTools?: string[];
  /** Any additional frontmatter fields */
  [key: string]: unknown;
}

/**
 * A command entity loaded from a .md file
 */
export interface Command {
  /** Command name (derived from filename) */
  name: string;
  /** Path to the command file */
  path: string;
  /** Where this command came from */
  source: EntitySource;
  /** Command description */
  description?: string;
  /** The markdown content (after frontmatter) */
  content: string;
  /** Parsed frontmatter metadata */
  metadata: CommandMetadata;
}
