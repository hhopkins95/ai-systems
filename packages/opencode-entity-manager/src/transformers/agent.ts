/**
 * Agent Transformer
 *
 * Transforms Claude Code agent metadata to OpenCode format.
 *
 * Transformations:
 * - tools: ["read", "write"] → tools: { read: true, write: true }
 * - Adds mode: "subagent" (default)
 * - Preserves description and model fields
 */

/**
 * OpenCode agent frontmatter structure
 */
export interface OpenCodeAgentFrontmatter {
  description?: string;
  mode: "subagent";
  tools?: Record<string, boolean>;
  model?: string;
}

/**
 * Parse tools from various formats:
 * - Array: ["read", "write"]
 * - Comma-separated string: "read, write"
 * - Single string: "read"
 */
export function parseTools(tools: unknown): string[] {
  if (Array.isArray(tools)) {
    return tools.filter((t) => typeof t === "string");
  }
  if (typeof tools === "string") {
    return tools
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Transform Claude agent metadata to OpenCode frontmatter format
 */
export function transformAgentMetadata(
  claudeMetadata: Record<string, unknown>
): OpenCodeAgentFrontmatter {
  const opencode: OpenCodeAgentFrontmatter = {
    mode: "subagent",
  };

  // Copy description directly
  if (claudeMetadata.description) {
    opencode.description = claudeMetadata.description as string;
  }

  // Transform tools to object format
  if (claudeMetadata.tools) {
    const toolsList = parseTools(claudeMetadata.tools);
    if (toolsList.length > 0) {
      opencode.tools = {};
      for (const tool of toolsList) {
        opencode.tools[tool] = true;
      }
    }
  }

  // Copy model if present
  if (claudeMetadata.model) {
    opencode.model = claudeMetadata.model as string;
  }

  return opencode;
}
