/**
 * Rule entity types for CLAUDE.md and .claude/rules/*.md files
 */

import type { EntitySource } from "../sources.js";

/**
 * Rule metadata from YAML frontmatter
 */
export interface RuleMetadata {
  /** Glob patterns for conditional loading (e.g., "src/api/**.ts") */
  paths?: string;
  /** True for CLAUDE.md files, false for rules/.md files */
  isMain?: boolean;
  /** Any additional frontmatter fields */
  [key: string]: unknown;
}

/**
 * A rule entity loaded from a CLAUDE.md or rules directory
 */
export interface Rule {
  /** Rule name (derived from filename, e.g., "CLAUDE" or "code-style") */
  name: string;
  /** The markdown content (after frontmatter) */
  content: string;
  /** Parsed frontmatter metadata */
  metadata: RuleMetadata;
}

export type RuleWithSource = Rule & { source?: EntitySource };
