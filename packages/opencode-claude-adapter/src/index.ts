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

import { syncSkills, createSkillTools } from "./adapters/skill-adapter";
import { syncCommands } from "./adapters/command-adapter";
import { syncAgents } from "./adapters/agent-adapter";
import { syncInstructions } from "./adapters/instruction-adapter";

export const ClaudeAdapterPlugin: Plugin = async (ctx) => {
  const projectDir = ctx.directory;

  console.log("[claude-adapter] Starting sync...");

  // Initialize entity manager
  const manager = new ClaudeEntityManager({
    projectDir,
  });

  // Load all entities (includeContents=true for skill file access)
  const entities = await manager.loadAllEntities(true);
  const claudeMdFiles = await manager.loadClaudeMdFiles();

  // Log what we found
  const skillSources = countBySources(entities.skills.map((s) => s.source.type));
  const commandSources = countBySources(entities.commands.map((c) => c.source.type));
  const agentSources = countBySources(entities.agents.map((a) => a.source.type));

  console.log(
    `[claude-adapter] Found ${entities.skills.length} skills (${formatSources(skillSources)})`
  );
  console.log(
    `[claude-adapter] Found ${entities.commands.length} commands (${formatSources(commandSources)})`
  );
  console.log(
    `[claude-adapter] Found ${entities.agents.length} agents (${formatSources(agentSources)})`
  );

  // Sync skills
  const { syncResult: skillResult, syncedSkills } = await syncSkills(
    entities.skills,
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
  const commandResult = await syncCommands(entities.commands, projectDir);
  if (commandResult.written.length > 0) {
    console.log(
      `[claude-adapter] Wrote ${commandResult.written.length} commands to .opencode/command/`
    );
  }
  for (const error of commandResult.errors) {
    console.error(`[claude-adapter] Error writing command ${error.file}: ${error.error}`);
  }

  // Sync agents
  const agentResult = await syncAgents(entities.agents, projectDir);
  if (agentResult.written.length > 0) {
    console.log(
      `[claude-adapter] Wrote ${agentResult.written.length} agents to .opencode/agent/`
    );
  }
  for (const error of agentResult.errors) {
    console.error(`[claude-adapter] Error writing agent ${error.file}: ${error.error}`);
  }

  // Sync instructions
  const instructionResult = await syncInstructions(claudeMdFiles, projectDir);
  if (instructionResult.written) {
    console.log(
      `[claude-adapter] Synced CLAUDE.md → AGENTS.md (${instructionResult.sources.length} sources)`
    );
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
