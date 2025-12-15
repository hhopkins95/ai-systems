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
  OpenCodeEntityWriter,
  type SkillInfo,
} from "@ai-systems/opencode-entity-manager";

import { createSkillTools, generateToolName } from "./adapters/skill-adapter";

export const ClaudeAdapterPlugin: Plugin = async (ctx) => {
  const projectDir = ctx.directory;

  console.log("[claude-adapter] Starting sync...");

  // Initialize entity manager and writer
  const manager = new ClaudeEntityManager({
    projectDir,
  });
  const writer = new OpenCodeEntityWriter({
    projectDir,
    configFilePath: process.env.OPENCODE_CONFIG ?? "",
    configDirectory: process.env.OPENCODE_CONFIG_DIR ?? "",
  });

  // Load complete agent context (includes all entities, MCP servers, memory files)
  const agentContext = await manager.loadAgentContext({
    includeSkillFileContents: true,
  });

  // Log what we found
  const skillSources = countBySources(agentContext.skills.map((s) => s.source?.type ?? "global"));
  const commandSources = countBySources(agentContext.commands.map((c) => c.source?.type ?? "global"));
  const agentSources = countBySources(agentContext.subagents.map((a) => a.source?.type ?? "global"));

  console.log(
    `[claude-adapter] Found ${agentContext.skills.length} skills (${formatSources(skillSources)})`
  );
  console.log(
    `[claude-adapter] Found ${agentContext.commands.length} commands (${formatSources(commandSources)})`
  );
  console.log(
    `[claude-adapter] Found ${agentContext.subagents.length} agents (${formatSources(agentSources)})`
  );

  // Sync skills using writer
  const { syncResult: skillResult, syncedSkills } = await writer.syncSkills(
    agentContext.skills
  );
  if (skillResult.written.length > 0) {
    console.log(
      `[claude-adapter] Wrote ${skillResult.written.length} skills to .opencode/skills/`
    );
  }
  for (const error of skillResult.errors) {
    console.error(`[claude-adapter] Error writing skill ${error.file}: ${error.error}`);
  }

  // Sync commands using writer
  const commandResult = await writer.syncCommands(agentContext.commands);
  if (commandResult.written.length > 0) {
    console.log(
      `[claude-adapter] Wrote ${commandResult.written.length} commands to .opencode/command/`
    );
  }
  for (const error of commandResult.errors) {
    console.error(`[claude-adapter] Error writing command ${error.file}: ${error.error}`);
  }

  // Sync agents using writer
  const agentResult = await writer.syncAgents(agentContext.subagents);
  if (agentResult.written.length > 0) {
    console.log(
      `[claude-adapter] Wrote ${agentResult.written.length} agents to .opencode/agent/`
    );
  }
  for (const error of agentResult.errors) {
    console.error(`[claude-adapter] Error writing agent ${error.file}: ${error.error}`);
  }

  // Sync instructions (memory files) using writer
  const instructionResult = await writer.writeInstructions(agentContext.memoryFiles);
  if (instructionResult.created) {
    console.log(`[claude-adapter] Synced CLAUDE.md → AGENTS.md`);
  }

  // Write skills instructions to separate file if there are skills
  if (syncedSkills.length > 0) {
    const skillInfos: SkillInfo[] = syncedSkills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      toolName: generateToolName(skill.name),
    }));

    const skillsInstructionResult = await writer.writeSkillsInstructions(skillInfos);
    if (skillsInstructionResult.created) {
      console.log(`[claude-adapter] Wrote skill instructions to .opencode/SKILLS.md`);

      // Add SKILLS.md to opencode.json instructions array
      await writer.addInstructionFiles([".opencode/SKILLS.md"]);
      console.log(`[claude-adapter] Added .opencode/SKILLS.md to opencode.json instructions`);

      // Add opencode-skills plugin
      await writer.addPlugins(["opencode-skills"]);
      console.log(`[claude-adapter] Added opencode-skills plugin to opencode.json`);
    }
  }

  // Sync MCP servers using writer
  if (agentContext.mcpServers.length > 0) {
    const mcpResult = await writer.syncMcpServers(agentContext.mcpServers);
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
