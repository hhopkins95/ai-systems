import { readdir, stat, readFile } from "fs/promises";
import { join } from "path";
import fg from "fast-glob";
import type { PluginManifest, McpServerConfig } from "../types.js";
import {
  getSkillsDir,
  getCommandsDir,
  getAgentsDir,
  getHooksDir,
  getPluginManifestPath,
} from "../utils/paths.js";

/**
 * Entity counts for a plugin or directory
 */
export interface EntityCounts {
  skills: number;
  commands: number;
  agents: number;
  hooks: number;
  hasMcp: boolean;
}

/**
 * Service for counting entities in a directory
 */
export class EntityDiscovery {
  /**
   * Count all entities in a directory
   */
  async countEntities(baseDir: string): Promise<EntityCounts> {
    const [skills, commands, agents, hooks, hasMcp] = await Promise.all([
      this.countSkills(baseDir),
      this.countCommands(baseDir),
      this.countAgents(baseDir),
      this.countHooks(baseDir),
      this.hasMcpServers(baseDir),
    ]);

    return { skills, commands, agents, hooks, hasMcp };
  }

  /**
   * Count skills in a directory
   */
  async countSkills(baseDir: string): Promise<number> {
    // First try the standard skills/ subdirectory
    const skillsDir = getSkillsDir(baseDir);
    try {
      const skillMdFiles = await fg("**/SKILL.md", {
        cwd: skillsDir,
        caseSensitiveMatch: false,
      });
      if (skillMdFiles.length > 0) {
        return skillMdFiles.length;
      }
    } catch {
      // skills/ doesn't exist
    }

    // Also check root level (for skills collections like anthropic-agent-skills)
    try {
      const skillMdFiles = await fg("**/SKILL.md", {
        cwd: baseDir,
        caseSensitiveMatch: false,
      });
      return skillMdFiles.length;
    } catch {
      return 0;
    }
  }

  /**
   * Count commands in a directory
   */
  async countCommands(baseDir: string): Promise<number> {
    const commandsDir = getCommandsDir(baseDir);
    try {
      const files = await readdir(commandsDir);
      return files.filter((f) => f.endsWith(".md")).length;
    } catch {
      return 0;
    }
  }

  /**
   * Count agents in a directory
   */
  async countAgents(baseDir: string): Promise<number> {
    const agentsDir = getAgentsDir(baseDir);
    try {
      const files = await readdir(agentsDir);
      return files.filter((f) => f.endsWith(".md")).length;
    } catch {
      return 0;
    }
  }

  /**
   * Count hooks in a directory
   */
  async countHooks(baseDir: string): Promise<number> {
    const hooksDir = getHooksDir(baseDir);
    try {
      const files = await readdir(hooksDir);
      return files.filter((f) => f.endsWith(".json")).length;
    } catch {
      return 0;
    }
  }

  /**
   * Check if a plugin has MCP servers configured
   */
  async hasMcpServers(baseDir: string): Promise<boolean> {
    try {
      const manifestPath = getPluginManifestPath(baseDir);
      const content = await readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(content) as PluginManifest;
      return Boolean(
        manifest.mcpServers && Object.keys(manifest.mcpServers).length > 0
      );
    } catch {
      return false;
    }
  }
}
