/**
 * Agent (subagent) entity types
 */

import type { EntitySource } from "../sources.js";

/**
 * Agent metadata from YAML frontmatter
 */
export interface AgentMetadata {
  /** Agent description (shown to users and used for triggering) */
  description?: string;
  /** Model to use for this agent */
  model?: string;
  /** Tools this agent is allowed to use */
  tools?: string[];
  /** Color for UI display */
  color?: string;
  /** Any additional frontmatter fields */
  [key: string]: unknown;
}

/**
 * An agent entity loaded from a .md file (subagent definition)
 */
export interface Agent {
  /** Agent name (derived from filename) */
  name: string;
  /** Path to the agent file */
  path: string;
  /** Where this agent came from */
  source: EntitySource;
  /** Agent description */
  description?: string;
  /** The markdown content (system prompt, after frontmatter) */
  content: string;
  /** Parsed frontmatter metadata */
  metadata: AgentMetadata;
}
