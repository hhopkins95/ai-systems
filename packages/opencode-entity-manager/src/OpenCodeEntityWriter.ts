/**
 * OpenCodeEntityWriter
 *
 * Writer for OpenCode entities to a project's .opencode directory.
 * This is the OpenCode counterpart to EntityWriter in claude-entity-manager.
 */

import { writeFile, readFile, copyFile, readdir, mkdir } from "fs/promises";
import { join, dirname } from "path";
import matter from "gray-matter";
import type {
  Agent,
  Command,
  MemoryFile,
  McpServer,
  SkillWithSource,
  OpencodeSettings,
} from "@ai-systems/shared-types";

import { transformAgentMetadata } from "./transformers/agent.js";
import { transformMcpServer } from "./transformers/mcp.js";
import { formatAgentsMd, type SkillInfo } from "./transformers/instruction.js";
import {
  getOpenCodeDir,
  getAgentsDir,
  getSkillsDir,
  getCommandsDir,
  getOpencodeConfigPath,
  getAgentsMdPath,
} from "./utils/paths.js";
import { ensureDir, clearDirectory } from "./utils/file-ops.js";

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
 * Options for writing entities
 */
export interface WriteEntityOptions {
  /** Add header comment indicating source */
  includeSourceHeader?: boolean;
  /** Source path to include in header */
  sourcePath?: string;
}

/**
 * Options for writing AGENTS.md
 */
export interface InstructionsOptions {
  /** Skill information to include in instructions */
  skills?: SkillInfo[];
}

// Re-export SkillInfo for convenience
export type { SkillInfo };

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
  private projectDir: string;
  private opencodeDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
    this.opencodeDir = getOpenCodeDir(projectDir);
  }

  // ============================================
  // Individual Write Operations
  // ============================================

  /**
   * Write an agent to .opencode/agent/{name}.md
   * Transforms tools array to object format, adds mode: "subagent"
   */
  async writeAgent(
    agent: Agent,
    options: WriteEntityOptions = {}
  ): Promise<WriteResult> {
    const agentsDir = getAgentsDir(this.opencodeDir);
    await ensureDir(agentsDir);

    const filePath = join(agentsDir, `${agent.name}.md`);

    // Build header if requested
    const header = this.buildHeader(options);

    // Transform frontmatter
    const transformedFrontmatter = transformAgentMetadata(agent.metadata);

    // Build file content
    const fileContent = matter.stringify(agent.content, transformedFrontmatter);

    await writeFile(filePath, header + fileContent, "utf-8");
    return { path: filePath, created: true };
  }

  /**
   * Write a skill to .opencode/skills/{name}/
   * Copies entire skill directory including supporting files
   */
  async writeSkill(skill: SkillWithSource): Promise<WriteResult> {
    const skillsDir = getSkillsDir(this.opencodeDir);
    const destDir = join(skillsDir, skill.name);
    await ensureDir(destDir);

    // Get source directory from skill path
    const sourceDir = dirname(skill.source?.path ?? "");

    // Copy the entire directory
    await this.copyDir(sourceDir, destDir);

    return { path: destDir, created: true };
  }

  /**
   * Write a command to .opencode/command/{name}.md
   * Preserves frontmatter, adds source header
   */
  async writeCommand(
    command: Command,
    options: WriteEntityOptions = {}
  ): Promise<WriteResult> {
    const commandsDir = getCommandsDir(this.opencodeDir);
    await ensureDir(commandsDir);

    const filePath = join(commandsDir, `${command.name}.md`);

    // Build header if requested
    const header = this.buildHeader(options);

    // Use gray-matter to stringify frontmatter + content
    const fileContent = matter.stringify(command.content, command.metadata);

    await writeFile(filePath, header + fileContent, "utf-8");
    return { path: filePath, created: true };
  }

  /**
   * Write instructions to AGENTS.md
   * Concatenates memory files and optionally includes skill documentation
   */
  async writeInstructions(
    memoryFiles: MemoryFile[],
    options: InstructionsOptions = {}
  ): Promise<WriteResult> {
    const filePath = getAgentsMdPath(this.projectDir);

    // Only write if we have content
    if (memoryFiles.length === 0 && (!options.skills || options.skills.length === 0)) {
      return { path: filePath, created: false };
    }

    const content = formatAgentsMd(memoryFiles, options.skills);
    await writeFile(filePath, content, "utf-8");

    return { path: filePath, created: true };
  }

  /**
   * Write/merge MCP servers to opencode.json
   * Transforms stdio → local, http → remote
   */
  async writeMcpServers(servers: McpServer[]): Promise<WriteResult> {
    const configPath = getOpencodeConfigPath(this.projectDir);

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

    const agentsDir = getAgentsDir(this.opencodeDir);
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
        const sourcePath = (agent as Agent & { source?: { path?: string } }).source?.path;
        await this.writeAgent(agent, {
          includeSourceHeader: true,
          sourcePath,
        });
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
    const skillsDir = getSkillsDir(this.opencodeDir);
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

    // Copy each skill directory
    for (const [name, skill] of skillMap) {
      const sourceDir = dirname(skill.source?.path ?? "");
      const destDir = join(skillsDir, name);

      try {
        await this.copyDir(sourceDir, destDir);
        result.written.push(name);

        // Get files from the copied location
        const files = await this.listFiles(destDir);

        syncedSkills.push({
          name: skill.name,
          description: skill.metadata.description ?? "",
          content: skill.content,
          files,
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

    const commandsDir = getCommandsDir(this.opencodeDir);
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
        const sourcePath = (command as Command & { source?: { path?: string } }).source?.path;
        await this.writeCommand(command, {
          includeSourceHeader: true,
          sourcePath,
        });
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
      const configPath = getOpencodeConfigPath(this.projectDir);

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
    const dir = join(this.opencodeDir, subPath);
    await clearDirectory(dir);
  }

  /**
   * Get the OpenCode directory path
   */
  getOpenCodeDir(): string {
    return this.opencodeDir;
  }

  /**
   * Get the project directory path
   */
  getProjectDir(): string {
    return this.projectDir;
  }

  // ============================================
  // Private Helpers
  // ============================================

  /**
   * Build header comment for auto-generated files
   */
  private buildHeader(options: WriteEntityOptions): string {
    if (!options.includeSourceHeader) {
      return "";
    }

    const lines = [
      "<!--",
      "  Auto-generated by opencode-claude-adapter",
    ];

    if (options.sourcePath) {
      lines.push(`  Source: ${options.sourcePath}`);
    }

    lines.push("  Do not edit - changes will be overwritten on next sync");
    lines.push("-->");
    lines.push("");

    return lines.join("\n");
  }

  /**
   * Recursively copy a directory
   */
  private async copyDir(src: string, dest: string): Promise<void> {
    await mkdir(dest, { recursive: true });

    const entries = await readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDir(srcPath, destPath);
      } else {
        await copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * Get list of files in a directory (relative paths)
   */
  private async listFiles(dir: string, base: string = ""): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const relativePath = base ? join(base, entry.name) : entry.name;

        if (entry.isDirectory()) {
          const subFiles = await this.listFiles(join(dir, entry.name), relativePath);
          files.push(...subFiles);
        } else {
          files.push(relativePath);
        }
      }
    } catch {
      // Directory might not exist
    }

    return files;
  }
}
