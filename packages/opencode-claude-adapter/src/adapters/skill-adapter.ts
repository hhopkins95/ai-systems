/**
 * Skill Adapter
 *
 * Registers skill tools for OpenCode. Skills are synced by OpenCodeEntityWriter,
 * this adapter creates the dynamic tools for skill invocation and file reading.
 *
 * Tools created:
 * - skills_<name>: Per-skill loader that injects skill content
 * - read_skill_file: Generic file reader for skill files
 */

import { tool } from "@opencode-ai/plugin";
import type { PluginInput, ToolDefinition } from "@opencode-ai/plugin";
import { readFile } from "fs/promises";
import { join } from "path";
import {
  generateFileTree,
  type SyncedSkill,
} from "@ai-systems/opencode-entity-manager";

/**
 * Generate tool name from skill name
 * Example: "pdf-analyzer" → "skills_pdf_analyzer"
 */
export function generateToolName(skillName: string): string {
  return "skills_" + skillName.replace(/-/g, "_");
}

/**
 * Create tools for synced skills
 * Reads from .opencode/skills/ (not original source)
 */
export function createSkillTools(
  syncedSkills: SyncedSkill[],
  ctx: PluginInput
): Record<string, ToolDefinition> {
  const tools: Record<string, ToolDefinition> = {};

  // Build skills map for file reader lookups
  const skillsMap = new Map<string, SyncedSkill>();
  for (const skill of syncedSkills) {
    skillsMap.set(skill.name, skill);
  }

  // Create per-skill loader tools
  for (const skill of syncedSkills) {
    const toolName = generateToolName(skill.name);

    tools[toolName] = tool({
      description: skill.description || `Load the ${skill.name} skill`,
      args: {},
      async execute(_args, toolCtx) {
        // Helper to send silent prompt (no AI response)
        const sendSilentPrompt = (text: string) =>
          ctx.client.session.prompt({
            path: { id: toolCtx.sessionID },
            body: {
              agent: toolCtx.agent,
              noReply: true,
              parts: [{ type: "text", text }],
            },
          });

        // Build skill content with file tree
        const fileTree = generateFileTree(skill.files);

        const skillContent = [
          `# Skill: ${skill.name}`,
          "",
          skill.content,
          "",
          "---",
          "",
          "## Available Files",
          "",
          "```",
          fileTree,
          "```",
          "",
          `Use \`read_skill_file\` with skill="${skill.name}" to access these files.`,
        ].join("\n");

        // Inject skill content as silent message
        await sendSilentPrompt(skillContent);

        // Return confirmation
        const additionalFiles = skill.files.filter(
          (f) => f.toLowerCase() !== "skill.md"
        ).length;
        return `Skill "${skill.name}" loaded. ${additionalFiles} additional files available.`;
      },
    });
  }

  // Create skill file reader tool (only if there are skills)
  if (syncedSkills.length > 0) {
    const skillNames = syncedSkills.map((s) => s.name);

    tools["read_skill_file"] = tool({
      description:
        "Read a file from a skill's directory. Use after loading a skill to access its supporting files.",
      args: {
        skill: tool.schema
          .string()
          .describe(`Skill name. Available: ${skillNames.join(", ")}`),
        path: tool.schema
          .string()
          .describe("Relative path to file within the skill directory"),
      },
      async execute({ skill: skillName, path: filePath }, _toolCtx) {
        const skill = skillsMap.get(skillName);

        if (!skill) {
          return `Error: Skill "${skillName}" not found. Available skills: ${skillNames.join(", ")}`;
        }

        // Security: ensure path doesn't escape skill directory
        if (filePath.includes("..")) {
          return "Error: Path traversal not allowed";
        }

        const fullPath = join(skill.dir, filePath);

        // Verify file is in skill's file list
        if (!skill.files.includes(filePath)) {
          const availableFiles = skill.files
            .filter((f) => f.toLowerCase() !== "skill.md")
            .join(", ");
          return `Error: File "${filePath}" not found in skill. Available: ${availableFiles}`;
        }

        try {
          const content = await readFile(fullPath, "utf-8");
          return content;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return `Error reading file: ${message}`;
        }
      },
    });
  }

  return tools;
}
