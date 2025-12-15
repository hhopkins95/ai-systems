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
  InstructionsOptions,
  SkillInfo,
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
  generateSkillsSection,
} from "./transformers/instruction.js";

// Utilities
export {
  getOpenCodeDir,
  getAgentsDir,
  getSkillsDir,
  getCommandsDir,
  getOpencodeConfigPath,
  getAgentsMdPath,
} from "./utils/paths.js";

export { clearDirectory, ensureDir } from "./utils/file-ops.js";

export { generateFileTree } from "./utils/file-tree.js";
