/**
 * OpenCodeEntityWriter
 *
 * Writer for OpenCode entities to a project's .opencode directory.
 * This is the OpenCode counterpart to EntityWriter in claude-entity-manager.
 */

import type {
  Agent,
  Command,
  McpServer,
  Rule,
  OpencodeSettings,
  Skill,
  SkillWithSource,
} from "@ai-systems/shared-types";
import { readFile, writeFile } from "fs/promises";
import matter from "gray-matter";
import { dirname, join } from "path";

import { transformAgentMetadata } from "./transformers/agent.js";
import { formatAgentsMd, formatSkillsMd } from "./transformers/instruction.js";
import { transformMcpServer } from "./transformers/mcp.js";
import { clearDirectory, ensureDir } from "./utils/file-ops.js";
import {
  getAgentsDir,
  getAgentsMdPath,
  getCommandsDir,
  getSkillsDir,
  getSkillsMdPath
} from "./utils/paths.js";

/**
 * Result of a single write operation
 */
export interface WriteResult {
  path: string;
  created: boolean;
}

/**
 * Result of a sync operation (multiple writes with clear)
 */
export interface SyncResult {
  written: string[];
  skipped: string[];
  errors: Array<{ file: string; error: string }>;
}

/**
 * Options for constructing OpenCodeEntityWriter
 */
export interface OpenCodeEntityWriterOptions {
  /** Custom config file path (OPENCODE_CONFIG) */
  configFilePath: string;
  /** Custom config directory (OPENCODE_CONFIG_DIR) */
  configDirectory: string;
}

/**
 * Info about a synced skill (for skill tool creation)
 */
export interface SyncedSkill {
  name: string;
  description: string;
  content: string;
  files: string[];
  dir: string;
}

/**
 * Writer for OpenCode entities to a project's .opencode directory
 */
export class OpenCodeEntityWriter {
  private configFilePath: string;
  private configDirectory: string;

  constructor(options: OpenCodeEntityWriterOptions) {
    this.configFilePath = options.configFilePath;
    this.configDirectory = options.configDirectory;
  }

  // ============================================
  // Individual Write Operations
  // ============================================

  /**
   * Write an agent to .opencode/agent/{name}.md
   * Transforms tools array to object format, adds mode: "subagent"
   */
  async writeAgent(agent: Agent): Promise<WriteResult> {
    const agentsDir = getAgentsDir(this.configDirectory);
    await ensureDir(agentsDir);

    const filePath = join(agentsDir, `${agent.name}.md`);

    // Transform frontmatter
    const transformedFrontmatter = transformAgentMetadata(agent.metadata);

    // Build file content
    const fileContent = matter.stringify(agent.content, transformedFrontmatter);

    await writeFile(filePath, fileContent, "utf-8");
    return { path: filePath, created: true };
  }

  /**
   * Write a skill to .opencode/skills/{name}/
   * Writes SKILL.md and supporting files from in-memory data
   */
  async writeSkill(skill: Skill): Promise<WriteResult> {
    const skillsDir = getSkillsDir(this.configDirectory);
    const destDir = join(skillsDir, skill.name);
    await ensureDir(destDir);

    // Write SKILL.md from content + metadata
    const skillMdPath = join(destDir, "SKILL.md");
    const skillMdContent = matter.stringify(skill.content, skill.metadata);
    await writeFile(skillMdPath, skillMdContent, "utf-8");

    // Write supporting files from fileContents
    if (skill.fileContents) {
      for (const [relativePath, content] of Object.entries(skill.fileContents)) {
        const filePath = join(destDir, relativePath);
        await ensureDir(dirname(filePath));
        await writeFile(filePath, content, "utf-8");
      }
    }

    return { path: destDir, created: true };
  }

  /**
   * Write a command to .opencode/command/{name}.md
   * Preserves frontmatter
   */
  async writeCommand(command: Command): Promise<WriteResult> {
    const commandsDir = getCommandsDir(this.configDirectory);
    await ensureDir(commandsDir);

    const filePath = join(commandsDir, `${command.name}.md`);

    // Use gray-matter to stringify frontmatter + content
    const fileContent = matter.stringify(command.content, command.metadata);

    await writeFile(filePath, fileContent, "utf-8");
    return { path: filePath, created: true };
  }

  /**
   * Write instructions to AGENTS.md
   * Concatenates rule files from CLAUDE.md and rules/ sources
   */
  async writeInstructions(rules: Rule[]): Promise<WriteResult> {
    const filePath = getAgentsMdPath(this.configDirectory);

    if (rules.length === 0) {
      return { path: filePath, created: false };
    }

    const content = formatAgentsMd(rules);
    if (!content) {
      return { path: filePath, created: false };
    }

    await writeFile(filePath, content, "utf-8");
    return { path: filePath, created: true };
  }

  /**
   * Write skill instructions to .opencode/SKILLS.md
   */
  async writeSkillsInstructions(skills: Skill[]): Promise<WriteResult> {
    const filePath = getSkillsMdPath(this.configDirectory);

    if (skills.length === 0) {
      return { path: filePath, created: false };
    }

    await ensureDir(this.configDirectory);
    const content = formatSkillsMd(skills);
    await writeFile(filePath, content, "utf-8");

    await this.addInstructionFiles([filePath]);

    return { path: filePath, created: true };
  }

  /**
   * Add instruction files to opencode.json instructions array
   * Ensures the specified files are included in the config
   */
  async addInstructionFiles(files: string[]): Promise<WriteResult> {
    const configPath = this.configFilePath;

    if (files.length === 0) {
      return { path: configPath, created: false };
    }

    // Read existing config
    let config: OpencodeSettings = {};
    try {
      const content = await readFile(configPath, "utf-8");
      config = JSON.parse(content) as OpencodeSettings;
    } catch {
      // File doesn't exist or can't be parsed - start fresh
    }

    // Initialize instructions array if needed
    if (!config.instructions) {
      config.instructions = [];
    }

    // Add files that aren't already present
    for (const file of files) {
      if (!config.instructions.includes(file)) {
        config.instructions.push(file);
      }
    }

    await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
    return { path: configPath, created: true };
  }

  /**
   * Add plugins to opencode.json plugin array
   * Ensures the specified plugins are included in the config
   */
  async addPlugins(plugins: string[]): Promise<WriteResult> {
    const configPath = this.configFilePath;

    if (plugins.length === 0) {
      return { path: configPath, created: false };
    }

    // Read existing config
    let config: OpencodeSettings = {};
    try {
      const content = await readFile(configPath, "utf-8");
      config = JSON.parse(content) as OpencodeSettings;
    } catch {
      // File doesn't exist or can't be parsed - start fresh
    }

    // Initialize plugin array if needed
    if (!config.plugin) {
      config.plugin = [];
    }

    // Add plugins that aren't already present
    for (const plugin of plugins) {
      if (!config.plugin.includes(plugin)) {
        config.plugin.push(plugin);
      }
    }

    await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
    return { path: configPath, created: true };
  }

  /**
   * Write/merge MCP servers to opencode.json
   * Transforms stdio → local, http → remote
   */
  async writeMcpServers(servers: McpServer[]): Promise<WriteResult> {
    const configPath = this.configFilePath;

    // Read existing config
    let config: OpencodeSettings = {};
    try {
      const content = await readFile(configPath, "utf-8");
      config = JSON.parse(content) as OpencodeSettings;
    } catch {
      // File doesn't exist or can't be parsed - start fresh
    }

    // Initialize mcp section
    if (!config.mcp) {
      config.mcp = {};
    }

    // Transform and add servers (later servers override earlier by name)
    for (const server of servers) {
      const transformed = transformMcpServer(server);
      if (transformed) {
        config.mcp[server.name] = transformed;
      }
    }

    await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
    return { path: configPath, created: Object.keys(config.mcp).length === servers.length };
  }

  // ============================================
  // Batch Sync Operations
  // ============================================

  /**
   * Sync all agents (clears .opencode/agent/ first)
   */
  async syncAgents(agents: Agent[]): Promise<SyncResult> {
    const result: SyncResult = {
      written: [],
      skipped: [],
      errors: [],
    };

    const agentsDir = getAgentsDir(this.configDirectory);
    await ensureDir(agentsDir);
    await clearDirectory(agentsDir);

    if (agents.length === 0) {
      return result;
    }

    // Deduplicate by name (later sources override earlier)
    const agentMap = new Map<string, Agent>();
    for (const agent of agents) {
      agentMap.set(agent.name, agent);
    }

    // Write each agent
    for (const [name, agent] of agentMap) {
      try {
        await this.writeAgent(agent);
        result.written.push(name);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push({ file: name, error: message });
      }
    }

    return result;
  }

  /**
   * Sync all skills (clears .opencode/skills/ first)
   * Returns synced skill info for tool creation
   */
  async syncSkills(
    skills: SkillWithSource[]
  ): Promise<{ syncResult: SyncResult; syncedSkills: SyncedSkill[] }> {
    const result: SyncResult = {
      written: [],
      skipped: [],
      errors: [],
    };

    const syncedSkills: SyncedSkill[] = [];
    const skillsDir = getSkillsDir(this.configDirectory);
    await ensureDir(skillsDir);
    await clearDirectory(skillsDir);

    if (skills.length === 0) {
      return { syncResult: result, syncedSkills };
    }

    // Deduplicate by name (later sources override earlier)
    const skillMap = new Map<string, SkillWithSource>();
    for (const skill of skills) {
      skillMap.set(skill.name, skill);
    }

    // Write each skill from in-memory data
    for (const [name, skill] of skillMap) {
      const destDir = join(skillsDir, name);

      try {
        await ensureDir(destDir);

        // Write SKILL.md from content + metadata
        const skillMdPath = join(destDir, "SKILL.md");
        const skillMdContent = matter.stringify(skill.content, skill.metadata);
        await writeFile(skillMdPath, skillMdContent, "utf-8");

        const writtenFiles = ["SKILL.md"];

        // Write supporting files from fileContents
        if (skill.fileContents) {
          for (const [relativePath, content] of Object.entries(skill.fileContents)) {
            const filePath = join(destDir, relativePath);
            await ensureDir(dirname(filePath));
            await writeFile(filePath, content, "utf-8");
            writtenFiles.push(relativePath);
          }
        }

        result.written.push(name);

        syncedSkills.push({
          name: skill.name,
          description: skill.metadata.description ?? "",
          content: skill.content,
          files: writtenFiles,
          dir: destDir,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push({ file: name, error: message });
      }
    }

    return { syncResult: result, syncedSkills };
  }

  /**
   * Sync all commands (clears .opencode/command/ first)
   */
  async syncCommands(commands: Command[]): Promise<SyncResult> {
    const result: SyncResult = {
      written: [],
      skipped: [],
      errors: [],
    };

    const commandsDir = getCommandsDir(this.configDirectory);
    await ensureDir(commandsDir);
    await clearDirectory(commandsDir);

    if (commands.length === 0) {
      return result;
    }

    // Deduplicate by name (later sources override earlier)
    const commandMap = new Map<string, Command>();
    for (const command of commands) {
      commandMap.set(command.name, command);
    }

    // Write each command
    for (const [name, command] of commandMap) {
      try {
        await this.writeCommand(command);
        result.written.push(name);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push({ file: name, error: message });
      }
    }

    return result;
  }

  /**
   * Sync MCP servers (clears mcp section in opencode.json)
   */
  async syncMcpServers(servers: McpServer[]): Promise<SyncResult> {
    const result: SyncResult = {
      written: [],
      skipped: [],
      errors: [],
    };

    if (servers.length === 0) {
      return result;
    }

    try {
      const configPath = this.configFilePath;

      // Read existing config
      let config: OpencodeSettings = {};
      try {
        const content = await readFile(configPath, "utf-8");
        config = JSON.parse(content) as OpencodeSettings;
      } catch {
        // Start fresh
      }

      // Clear existing MCP entries
      config.mcp = {};

      // Add servers (later sources override earlier)
      for (const server of servers) {
        const transformed = transformMcpServer(server);
        if (transformed) {
          config.mcp[server.name] = transformed;
          result.written.push(server.name);
        } else {
          result.skipped.push(server.name);
        }
      }

      await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push({ file: "opencode.json", error: message });
    }

    return result;
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Clear all contents of a subdirectory within .opencode
   */
   async clearSubDirectory(subPath: string): Promise<void> {
    const dir = join(this.configDirectory, subPath);
    await clearDirectory(dir);
  }

  /**
   * Get the OpenCode directory path
   */
  getOpenCodeDir(): string {
    return this.configDirectory;
  }

  /**
   * Get the custom config file path
   */
  getConfigFilePath(): string {
    return this.configFilePath;
  }

  /**
   * Get the custom config directory
   */
  getConfigDirectory(): string {
    return this.configDirectory;
  }
}
