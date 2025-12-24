/**
 * Skill entity types
 */

import type { EntitySource } from "../sources.js";

/**
 * Skill metadata from YAML frontmatter
 */
export interface SkillMetadata {
  /** Skill name (from frontmatter or directory name) */
  name?: string;
  /** Skill description */
  description?: string;
  /** Semantic version */
  version?: string;
  /** Categorization tags */
  tags?: string[];
  /** Tools this skill is allowed to use */
  allowedTools?: string[];
  /** NPM dependencies required by this skill */
  npmDependencies?: string[];
  /** Pip dependencies required by this skill */
  pipDependencies?: string[];
  /** Any additional frontmatter fields */
  [key: string]: unknown;
}

/**
 * A skill entity loaded from a SKILL.md file
 */
export interface Skill {
  /** Skill name (derived from directory or frontmatter) */
  name: string;
  /** The markdown content of the skill (after frontmatter) */
  content: string;
  /** Parsed frontmatter metadata */
  metadata: SkillMetadata;
  /** List of files in the skill directory (relative paths) */
  files: string[];
  /** File contents if loaded (keyed by relative path) */
  fileContents?: Record<string, string>;
}

export type SkillWithSource = Skill & {source?: EntitySource};