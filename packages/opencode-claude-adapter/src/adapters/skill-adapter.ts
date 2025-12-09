/**
 * Skill Adapter
 *
 * Syncs Claude Code skills to .opencode/skills/ and registers them as tools.
 *
 * Flow:
 * 1. Copy skill directories to .opencode/skills/<name>/
 * 2. Register per-skill loader tools (skills_<name>)
 * 3. Register skill file reader tool (read_skill_file)
 *
 * All file reads happen from the copied .opencode/skills/ location.
 */

import { tool } from "@opencode-ai/plugin";
import type { PluginInput, ToolDefinition } from "@opencode-ai/plugin";
import type { Skill, SkillWithSource } from "@ai-systems/shared-types";
import { readFile, mkdir, copyFile, readdir, stat } from "fs/promises";
import { join, dirname, relative } from "path";
import { generateFileTree } from "../utils/file-tree";

export interface SyncResult {
  written: string[];
  skipped: string[];
  errors: Array<{ file: string; error: string }>;
}

export interface SkillToolsResult {
  tools: Record<string, ToolDefinition>;
  syncResult: SyncResult;
}

/** Info about a synced skill (stored in .opencode/skills/) */
interface SyncedSkill {
  name: string;
  description: string;
  content: string;
  files: string[];
  dir: string; // Path to .opencode/skills/<name>/
}

/**
 * Generate tool name from skill name
 * Example: "pdf-analyzer" → "skills_pdf_analyzer"
 */
export function generateToolName(skillName: string): string {
  return "skills_" + skillName.replace(/-/g, "_");
}

/**
 * Recursively copy a directory
 */
async function copyDir(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });

  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}

/**
 * Get list of files in a directory (relative paths)
 */
async function listFiles(dir: string, base: string = ""): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const relativePath = base ? join(base, entry.name) : entry.name;

      if (entry.isDirectory()) {
        const subFiles = await listFiles(join(dir, entry.name), relativePath);
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

/**
 * Sync skills to .opencode/skills/ directory
 */
export async function syncSkills(
  skills: SkillWithSource[],
  projectDir: string
): Promise<{ syncResult: SyncResult; syncedSkills: SyncedSkill[] }> {
  const result: SyncResult = {
    written: [],
    skipped: [],
    errors: [],
  };

  const syncedSkills: SyncedSkill[] = [];

  if (skills.length === 0) {
    return { syncResult: result, syncedSkills };
  }

  const targetDir = join(projectDir, ".opencode", "skills");

  // Ensure directory exists
  await mkdir(targetDir, { recursive: true });

  // Deduplicate skills by name (later sources override earlier)
  const skillMap = new Map<string, SkillWithSource>();
  for (const skill of skills) {
    skillMap.set(skill.name, skill);
  }

  // Copy each skill directory
  for (const [name, skill] of skillMap) {
    const sourceDir = dirname(skill.source?.path ?? "");
    const destDir = join(targetDir, name);

    try {
      await copyDir(sourceDir, destDir);
      result.written.push(name);

      // Get files from the copied location
      const files = await listFiles(destDir);

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
