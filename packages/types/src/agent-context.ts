/**
 * AgentContext - the main composed type representing all entities
 * for an agent running in a given project context
 */

import type { Skill, Command, Agent, Hook, MemoryFile } from "./entities/index.js";
import type { McpServerConfig } from "./mcp.js";
import { Plugin, PluginSource } from "./plugin.js";
import { WorkspaceFile } from "./runtime/session.js";

/**
 * Sources that contributed to an AgentContext
 */
export interface AgentContextSources {
  /** Project directory (if running in a project) */
  projectDir?: string;
  /** User's global Claude directory */
  userGlobalDir: string;
  /** IDs of enabled plugins that contributed entities */
  enabledPlugins: string[];
}

/**
 * The complete context for an agent at RUNTIME -- independent of the entity sources, including all entities from all sources
 *
 * This represents the "state space" of an agent when run from a given folder -
 * all the capabilities, context, and configuration available to it.
 */
export interface AgentContext {
  /** Unique identifier for this context */
  id: string;
  /** Display name */
  name: string;

  // Entities from all enabled sources
  /** Skills available to the agent */
  skills: Skill[];
  /** Slash commands available */
  commands: Command[];
  /** Subagents that can be spawned */
  subagents: Agent[];
  /** Hooks for event handling */
  hooks: Hook[];

  // Integrations
  /** MCP servers to connect to */
  mcpServers: McpServerConfig[];

  // Memory/context
  /** Memory files (CLAUDE.md) in order of precedence */
  memoryFiles: MemoryFile[];

  // Provenance
  /** Information about where entities came from */
  sources: AgentContextSources;
}

/**
 * Options for loading an AgentContext
 */
export interface LoadAgentContextOptions {
  /** Project directory to load from */
  projectDir?: string;
  /** Whether to include disabled plugins */
  includeDisabledPlugins?: boolean;
  /** Whether to include file contents for skills */
  includeSkillFileContents?: boolean;
}




/**
 * Minimal agent profile data meant to be used to show all possible agent profiles before their full data are loaded.
 */
export interface AgentProfileListData {
  id: string,
  name: string,
  description?: string,
}

/**
 * Agent profile for how to cosntruct an agent -- includes sources
 */
export interface AgentProfile extends AgentProfileListData {

  systemPrompt?: string,

  memoryFile?: string,  // The CLAUDE.md file

  customEntities: {
    skills?: Skill[],
    subagents?: Agent[],
    commands?: Command[],
  }

  plugins? : PluginSource[]

  // MCP apps bundled in the codebase
  bundledMCPs?: {
    name: string,
    description: string,
    localProjectPath: string,
    startCommand: string,
    installCommand: string
  }[]
  externalMCPs?: McpServerConfig[],
  
  defaultWorkspaceFiles?: WorkspaceFile[],
}


