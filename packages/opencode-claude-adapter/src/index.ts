/**
 * OpenCode Claude Adapter
 *
 * Automatically syncs Claude Code configuration entities into OpenCode.
 * Maintains a single source of truth for skills, commands, agents, and instructions.
 *
 * Syncs:
 * - Skills → Dynamic tools (skills_*, read_skill_file)
 * - Commands → .opencode/command/*.md
 * - Agents → .opencode/agent/*.md (with frontmatter transformation)
 * - CLAUDE.md → AGENTS.md
 */

import type { Plugin } from "@opencode-ai/plugin";
import { ClaudeEntityManager } from "@hhopkins/claude-entity-manager";

import {
  syncSkills,
  createSkillTools,
  generateToolName,
} from "./adapters/skill-adapter";
import { syncCommands } from "./adapters/command-adapter";
import { syncAgents } from "./adapters/agent-adapter";
import { syncInstructions, type SkillInfo } from "./adapters/instruction-adapter";
import { syncMcpServers } from "./adapters/mcp-adapter";

export const ClaudeAdapterPlugin: Plugin = async (ctx) => {
  const projectDir = ctx.directory;

  console.log("[claude-adapter] Starting sync...");

  // Initialize entity manager
  const manager = new ClaudeEntityManager({
    projectDir,
  });

  // Load complete agent context (includes all entities, MCP servers, memory files)
  const agentContext = await manager.loadAgentContext({
    includeSkillFileContents: true,
  });

  // Log what we found
  const skillSources = countBySources(agentContext.skills.map((s) => s.source.type));
  const commandSources = countBySources(agentContext.commands.map((c) => c.source.type));
  const agentSources = countBySources(agentContext.subagents.map((a) => a.source.type));

  console.log(
    `[claude-adapter] Found ${agentContext.skills.length} skills (${formatSources(skillSources)})`
  );
  console.log(
    `[claude-adapter] Found ${agentContext.commands.length} commands (${formatSources(commandSources)})`
  );
  console.log(
    `[claude-adapter] Found ${agentContext.subagents.length} agents (${formatSources(agentSources)})`
  );

  // Sync skills
  const { syncResult: skillResult, syncedSkills } = await syncSkills(
    agentContext.skills,
    projectDir
  );
  if (skillResult.written.length > 0) {
    console.log(
      `[claude-adapter] Wrote ${skillResult.written.length} skills to .opencode/skills/`
    );
  }
  for (const error of skillResult.errors) {
    console.error(`[claude-adapter] Error writing skill ${error.file}: ${error.error}`);
  }

  // Sync commands
  const commandResult = await syncCommands(agentContext.commands, projectDir);
  if (commandResult.written.length > 0) {
    console.log(
      `[claude-adapter] Wrote ${commandResult.written.length} commands to .opencode/command/`
    );
  }
  for (const error of commandResult.errors) {
    console.error(`[claude-adapter] Error writing command ${error.file}: ${error.error}`);
  }

  // Sync agents (subagents in AgentContext)
  const agentResult = await syncAgents(agentContext.subagents, projectDir);
  if (agentResult.written.length > 0) {
    console.log(
      `[claude-adapter] Wrote ${agentResult.written.length} agents to .opencode/agent/`
    );
  }
  for (const error of agentResult.errors) {
    console.error(`[claude-adapter] Error writing agent ${error.file}: ${error.error}`);
  }

  // Transform synced skills to SkillInfo for instruction generation
  const skillInfos: SkillInfo[] = syncedSkills.map((skill) => ({
    name: skill.name,
    description: skill.description,
    toolName: generateToolName(skill.name),
  }));

  // Sync instructions (memory files + skill instructions)
  const instructionResult = await syncInstructions(
    agentContext.memoryFiles,
    projectDir,
    skillInfos
  );
  if (instructionResult.written) {
    console.log(
      `[claude-adapter] Synced CLAUDE.md → AGENTS.md (${instructionResult.sources.length} sources)`
    );
  }

  // Sync MCP servers to opencode.config.json
  if (agentContext.mcpServers.length > 0) {
    const mcpResult = await syncMcpServers(agentContext.mcpServers, projectDir);
    if (mcpResult.written.length > 0) {
      console.log(
        `[claude-adapter] Synced ${mcpResult.written.length} MCP servers to opencode.json`
      );
    }
    for (const error of mcpResult.errors) {
      console.error(`[claude-adapter] Error syncing MCP: ${error.error}`);
    }
  }

  // Create skill tools (using synced skills from .opencode/skills/)
  const tools = createSkillTools(syncedSkills, ctx);
  if (Object.keys(tools).length > 0) {
    console.log(`[claude-adapter] Registered ${Object.keys(tools).length} skill tools`);
  }

  console.log("[claude-adapter] Sync complete");

  return {
    tool: tools,
  };
};

// Helper: count entities by source type
function countBySources(
  sources: Array<"global" | "project" | "plugin">
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const source of sources) {
    counts[source] = (counts[source] || 0) + 1;
  }
  return counts;
}

// Helper: format source counts for logging
function formatSources(counts: Record<string, number>): string {
  const parts: string[] = [];
  if (counts.global) parts.push(`${counts.global} global`);
  if (counts.project) parts.push(`${counts.project} project`);
  if (counts.plugin) parts.push(`${counts.plugin} plugin`);
  return parts.join(", ") || "none";
}

export default ClaudeAdapterPlugin;
