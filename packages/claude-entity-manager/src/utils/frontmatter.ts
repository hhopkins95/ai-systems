import matter from "gray-matter";

/**
 * Result of parsing frontmatter from a file
 */
export interface ParsedFrontmatter<T = Record<string, unknown>> {
  /** Parsed frontmatter data */
  data: T;
  /** Markdown content after frontmatter */
  content: string;
}

/**
 * Parse frontmatter from markdown content
 * @param content - Raw markdown content with optional YAML frontmatter
 * @returns Parsed frontmatter data and content body
 */
export function parseFrontmatter<T = Record<string, unknown>>(
  content: string
): ParsedFrontmatter<T> {
  try {
    const { data, content: body } = matter(content);
    return { data: data as T, content: body.trim() };
  } catch {
    // On YAML error, extract what we can
    return extractFrontmatterFallback<T>(content);
  }
}

/**
 * Fallback parser for malformed YAML frontmatter
 * Extracts single-line fields and body when gray-matter fails
 */
function extractFrontmatterFallback<T>(content: string): ParsedFrontmatter<T> {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!fmMatch) {
    return { data: {} as T, content: content.trim() };
  }

  const [, frontmatter, body] = fmMatch;
  const data: Record<string, unknown> = {};

  // Extract single-line fields that are reliably parseable
  const fields = ["name", "model", "color"];
  for (const field of fields) {
    const match = frontmatter.match(new RegExp(`^${field}:\\s*(.+)$`, "m"));
    if (match) data[field] = match[1].trim();
  }

  // Description fallback: first non-heading line of body
  const firstLine = body.trim().split("\n")[0]?.trim();
  if (firstLine && !firstLine.startsWith("#")) {
    data.description = firstLine;
  }

  return { data: data as T, content: body.trim() };
}

/**
 * Extract the first non-empty, non-heading line as a description
 * @param content - Markdown content
 * @returns First paragraph or empty string
 */
export function extractFirstParagraph(content: string): string {
  const lines = content.trim().split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      return trimmed;
    }
  }
  return "";
}

/**
 * Extract the first line as a description
 * @param content - Markdown content
 * @returns First line or empty string
 */
export function extractFirstLine(content: string): string {
  const line = content.trim().split("\n")[0];
  return line?.trim() || "";
}
