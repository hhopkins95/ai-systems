/**
 * Memory file (CLAUDE.md) types
 */

/**
 * Scope of a memory file
 * Note: "global" is used for backward compatibility (same as user's home ~/.claude/)
 */
export type MemoryFileScope = "global" | "project" | "nested";

/**
 * A memory file (CLAUDE.md) with its content and metadata
 */
export interface MemoryFile {
  /** Absolute path to the file */
  path: string;
  /** File content (markdown, after frontmatter) */
  content: string;
  /** Parsed YAML frontmatter */
  frontmatter?: Record<string, unknown>;
  /** Where this memory file is scoped */
  scope: MemoryFileScope;
  /** For nested files, path relative to project root */
  relativePath?: string;
  /** Depth level (0 for global/project, 1+ for nested) */
  depth?: number;
}
