/**
 * OpenCode Entity Manager
 *
 * Provides OpenCodeEntityWriter for writing entities to OpenCode's .opencode directory.
 * This is the OpenCode counterpart to EntityWriter in claude-entity-manager.
 */

export { OpenCodeEntityWriter } from "./OpenCodeEntityWriter.js";

// Types
export type {
  WriteResult,
  SyncResult,
  OpenCodeEntityWriterOptions,
  SyncedSkill,
} from "./OpenCodeEntityWriter.js";

// Transformers (for advanced use cases)
export {
  parseTools,
  transformAgentMetadata,
  type OpenCodeAgentFrontmatter,
} from "./transformers/agent.js";

export { transformMcpServer } from "./transformers/mcp.js";

export {
  formatAgentsMd,
  formatSkillsMd,
  generateSkillsSection,
} from "./transformers/instruction.js";

export { clearDirectory, ensureDir } from "./utils/file-ops.js";

export { generateFileTree } from "./utils/file-tree.js";
