import { mkdir, writeFile, readFile } from "fs/promises";
import { join, dirname } from "path";
import * as matter from "gray-matter";
import type {
  Skill,
  Command,
  Agent,
  Hook,
  HookEvent,
  HookMatcher,
} from "../types.js";
import {
  getSkillsDir,
  getCommandsDir,
  getAgentsDir,
  getHooksDir,
  getProjectClaudeDir,
  getMcpConfigPath,
} from "../utils/paths.js";
import type { McpJsonConfig, McpServerWithSource } from "../loaders/MCPLoader.js";

/**
 * Result of a write operation
 */
export interface WriteResult {
  path: string;
  created: boolean;
}

/**
 * MCP server input for writing (name + config fields)
 */
export interface McpServerInput {
  name: string;
  type?: "stdio" | "http";
  // Stdio fields
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // HTTP fields
  url?: string;
  headers?: Record<string, string>;
}

/**
 * Options for writing entities
 */
export interface WriteEntitiesOptions {
  skills?: Skill[];
  commands?: Command[];
  agents?: Agent[];
  hooks?: Hook[];
  claudeMd?: string;
  mcpServers?: McpServerInput[];
}

/**
 * Writer for Claude Code entities to a project's .claude directory
 */
export class EntityWriter {
  private projectDir: string;
  private claudeDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
    this.claudeDir = getProjectClaudeDir(projectDir);
  }

  /**
   * Write a skill to skills/{name}/SKILL.md
   * Also writes any supporting files from fileContents
   */
  async writeSkill(skill: Skill): Promise<WriteResult> {
    const skillDir = join(getSkillsDir(this.claudeDir), skill.name);
    await this.ensureDir(skillDir);

    // Write SKILL.md
    const skillPath = join(skillDir, "SKILL.md");
    const fileContent = this.formatWithFrontmatter(skill.metadata, skill.content);
    await writeFile(skillPath, fileContent, "utf-8");

    // Write supporting files if present
    if (skill.fileContents) {
      for (const [relativePath, content] of Object.entries(skill.fileContents)) {
        // Skip SKILL.md variants - already written
        if (relativePath.toLowerCase() === "skill.md") continue;

        const filePath = join(skillDir, relativePath);
        await this.ensureDir(dirname(filePath));
        await writeFile(filePath, content, "utf-8");
      }
    }

    return { path: skillPath, created: true };
  }

  /**
   * Write a command to commands/{name}.md
   */
  async writeCommand(command: Command): Promise<WriteResult> {
    const commandsDir = getCommandsDir(this.claudeDir);
    await this.ensureDir(commandsDir);

    const filePath = join(commandsDir, `${command.name}.md`);
    const fileContent = this.formatWithFrontmatter(command.metadata, command.content);

    await writeFile(filePath, fileContent, "utf-8");
    return { path: filePath, created: true };
  }

  /**
   * Write an agent to agents/{name}.md
   */
  async writeAgent(agent: Agent): Promise<WriteResult> {
    const agentsDir = getAgentsDir(this.claudeDir);
    await this.ensureDir(agentsDir);

    const filePath = join(agentsDir, `${agent.name}.md`);
    const fileContent = this.formatWithFrontmatter(agent.metadata, agent.content);

    await writeFile(filePath, fileContent, "utf-8");
    return { path: filePath, created: true };
  }

  /**
   * Write a hook to hooks/{name}.json
   * Merges with existing hooks if the file exists
   */
  async writeHook(hook: Hook): Promise<WriteResult> {
    const hooksDir = getHooksDir(this.claudeDir);
    await this.ensureDir(hooksDir);

    const filePath = join(hooksDir, `${hook.name}.json`);

    // Try to read existing hooks and merge
    let existingHooks: Partial<Record<HookEvent, HookMatcher[]>> = {};
    try {
      const existingContent = await readFile(filePath, "utf-8");
      existingHooks = JSON.parse(existingContent);
    } catch {
      // File doesn't exist or can't be parsed - start fresh
    }

    // Merge hooks: combine matchers for each event type
    const mergedHooks = this.mergeHooks(existingHooks, hook.hooks);

    await writeFile(filePath, JSON.stringify(mergedHooks, null, 2), "utf-8");
    return { path: filePath, created: true };
  }

  /**
   * Write CLAUDE.md to the project's .claude directory
   */
  async writeClaudeMd(content: string): Promise<WriteResult> {
    await this.ensureDir(this.claudeDir);

    const filePath = join(this.claudeDir, "CLAUDE.md");
    await writeFile(filePath, content, "utf-8");

    return { path: filePath, created: true };
  }

  /**
   * Write MCP servers to .claude/.mcp.json
   * Merges with existing config if present (new servers overwrite by name)
   * Supports both stdio and http server types
   */
  async writeMcpServers(servers: McpServerInput[]): Promise<WriteResult> {
    await this.ensureDir(this.claudeDir);

    const mcpPath = getMcpConfigPath(this.claudeDir);

    // Read existing config for merging
    let existingConfig: McpJsonConfig = { mcpServers: {} };
    try {
      const content = await readFile(mcpPath, "utf-8");
      existingConfig = JSON.parse(content) as McpJsonConfig;
      if (!existingConfig.mcpServers) {
        existingConfig.mcpServers = {};
      }
    } catch {
      // File doesn't exist or can't be parsed - start fresh
    }

    // Merge: new servers overwrite existing by name
    const mergedServers = { ...existingConfig.mcpServers };
    for (const server of servers) {
      // Build config based on server type
      const isHttp = server.type === "http" || (!server.type && server.url && !server.command);

      if (isHttp) {
        // HTTP server
        mergedServers[server.name] = {
          type: "http",
          url: server.url,
          headers: server.headers,
        };
      } else {
        // Stdio server (default)
        const stdioConfig: {
          type?: "stdio" | "http";
          command?: string;
          args?: string[];
          env?: Record<string, string>;
        } = {
          command: server.command,
          args: server.args,
          env: server.env,
        };
        // Only include type if explicitly set
        if (server.type === "stdio") {
          stdioConfig.type = "stdio";
        }
        mergedServers[server.name] = stdioConfig;
      }
    }

    const config: McpJsonConfig = { mcpServers: mergedServers };
    await writeFile(mcpPath, JSON.stringify(config, null, 2), "utf-8");

    return { path: mcpPath, created: Object.keys(existingConfig.mcpServers || {}).length === 0 };
  }

  /**
   * Write multiple entities at once
   */
  async writeEntities(options: WriteEntitiesOptions): Promise<{
    skills: WriteResult[];
    commands: WriteResult[];
    agents: WriteResult[];
    hooks: WriteResult[];
    claudeMd?: WriteResult;
    mcpServers?: WriteResult;
  }> {
    const results = {
      skills: [] as WriteResult[],
      commands: [] as WriteResult[],
      agents: [] as WriteResult[],
      hooks: [] as WriteResult[],
      claudeMd: undefined as WriteResult | undefined,
      mcpServers: undefined as WriteResult | undefined,
    };

    // Write skills
    if (options.skills) {
      for (const skill of options.skills) {
        const result = await this.writeSkill(skill);
        results.skills.push(result);
      }
    }

    // Write commands
    if (options.commands) {
      for (const command of options.commands) {
        const result = await this.writeCommand(command);
        results.commands.push(result);
      }
    }

    // Write agents
    if (options.agents) {
      for (const agent of options.agents) {
        const result = await this.writeAgent(agent);
        results.agents.push(result);
      }
    }

    // Write hooks
    if (options.hooks) {
      for (const hook of options.hooks) {
        const result = await this.writeHook(hook);
        results.hooks.push(result);
      }
    }

    // Write CLAUDE.md
    if (options.claudeMd) {
      results.claudeMd = await this.writeClaudeMd(options.claudeMd);
    }

    // Write MCP servers
    if (options.mcpServers && options.mcpServers.length > 0) {
      results.mcpServers = await this.writeMcpServers(options.mcpServers);
    }

    return results;
  }

  /**
   * Format content with YAML frontmatter
   */
  private formatWithFrontmatter(
    metadata: Record<string, unknown>,
    content: string
  ): string {
    // Filter out undefined/null values and internal fields
    const cleanMeta = Object.fromEntries(
      Object.entries(metadata).filter(
        ([key, value]) => value != null && !key.startsWith("_")
      )
    );

    // If no metadata, just return content
    if (Object.keys(cleanMeta).length === 0) {
      return content;
    }

    return matter.stringify(content, cleanMeta);
  }

  /**
   * Merge two hook configurations
   * Combines matchers for each event type, avoiding duplicates
   */
  private mergeHooks(
    existing: Partial<Record<HookEvent, HookMatcher[]>>,
    incoming: Partial<Record<HookEvent, HookMatcher[]>>
  ): Partial<Record<HookEvent, HookMatcher[]>> {
    const merged = { ...existing };

    for (const [event, matchers] of Object.entries(incoming)) {
      const hookEvent = event as HookEvent;
      if (!matchers) continue;

      if (!merged[hookEvent]) {
        merged[hookEvent] = [];
      }

      // Add matchers that don't already exist (by matcher string)
      for (const matcher of matchers) {
        const exists = merged[hookEvent]!.some(
          (m) => m.matcher === matcher.matcher &&
                 JSON.stringify(m.hooks) === JSON.stringify(matcher.hooks)
        );
        if (!exists) {
          merged[hookEvent]!.push(matcher);
        }
      }
    }

    return merged;
  }

  /**
   * Ensure a directory exists, creating it if necessary
   */
  private async ensureDir(dirPath: string): Promise<void> {
    await mkdir(dirPath, { recursive: true });
  }
}
