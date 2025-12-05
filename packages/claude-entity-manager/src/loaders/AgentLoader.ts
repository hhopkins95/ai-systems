import { readFile, readdir } from "fs/promises";
import { join, basename } from "path";
import type { Agent, EntitySource, AgentMetadata } from "../types.js";
import {
  parseFrontmatter,
  extractFirstLine,
} from "../utils/frontmatter.js";
import { getAgentsDir } from "../utils/paths.js";

/**
 * Loader for Claude Code agents (markdown files in agents/)
 */
export class AgentLoader {
  /**
   * Load all agents from a base directory
   * @param baseDir - Base directory (e.g., ~/.claude or plugin path)
   * @param source - Source information for loaded agents
   */
  async loadAgents(
    baseDir: string,
    source: Omit<EntitySource, "path">
  ): Promise<Agent[]> {
    const agentsDir = getAgentsDir(baseDir);
    const agents: Agent[] = [];

    try {
      const files = await readdir(agentsDir);

      for (const file of files) {
        if (!file.endsWith(".md")) continue;

        const agent = await this.loadAgent(join(agentsDir, file), source);
        if (agent) {
          agents.push(agent);
        }
      }
    } catch (error) {
      // agents/ directory doesn't exist - that's OK
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn(`Error loading agents from ${baseDir}:`, error);
      }
    }

    return agents;
  }

  /**
   * Load agents from explicit paths (relative to baseDir)
   * Used when marketplace.json specifies explicit agent paths
   */
  async loadAgentsFromPaths(
    baseDir: string,
    agentPaths: string[],
    source: Omit<EntitySource, "path">
  ): Promise<Agent[]> {
    const agents: Agent[] = [];

    for (const relativePath of agentPaths) {
      const agentFile = join(baseDir, relativePath);
      try {
        const agent = await this.loadAgent(agentFile, source);
        if (agent) {
          agents.push(agent);
        }
      } catch (error) {
        // Agent file doesn't exist or can't be read
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          console.warn(`Error loading agent from ${agentFile}:`, error);
        }
      }
    }

    return agents;
  }

  /**
   * Load a single agent from its file path
   */
  async loadAgent(
    filePath: string,
    source: Omit<EntitySource, "path">
  ): Promise<Agent | null> {
    try {
      const rawContent = await readFile(filePath, "utf-8");
      const { data, content } = parseFrontmatter<AgentMetadata>(rawContent);

      return {
        name: basename(filePath, ".md"),
        path: filePath,
        source: { ...source, path: filePath },
        description: data.description || extractFirstLine(content),
        content,
        metadata: data,
      };
    } catch (error) {
      console.warn(`Failed to load agent at ${filePath}:`, error);
      return null;
    }
  }
}
