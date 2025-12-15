/**
 * Instruction Transformer
 *
 * Transforms CLAUDE.md memory files into AGENTS.md format for OpenCode.
 * Also generates skill usage instructions when skills are present.
 */

import type { MemoryFile, Skill } from "@ai-systems/shared-types";

/**
 * Minimal skill info needed for instruction generation
//  */
// export interface Skill {
//   name: string;
//   description: string;
//   toolName: string;
// }

/**
 * Generate skill usage instructions section
 */
export function generateSkillsSection(skills: Skill[]): string {
  if (skills.length === 0) {
    return "";
  }

  const skillsList = skills
    .map((skill) => {
      const desc = skill.metadata.description || `Load the ${skill.name} skill`;
      return `- \`${skill.name}\`: ${desc}`;
    })
    .join("\n");

  return `## Skills

You have access to skills - specialized capabilities that provide domain knowledge and workflows for specific tasks. Skills are loaded on-demand using skill tools.

### How Skills Work

1. **Invoke a skill tool** when you need its capabilities (e.g., \`skills_pdf\` for PDF work)
2. **The skill expands** into detailed instructions injected into the conversation
3. **Follow the skill's guidance** to complete the task using its specialized knowledge
4. **Use \`read_skill_file\`** to access any supporting files the skill provides

### Available Skills

${skillsList}

### When to Use Skills

- Check skill descriptions to find the right skill for a task
- Invoke a skill BEFORE starting work that matches its domain
- Skills provide specialized tools, patterns, and best practices
- Don't invoke a skill that's already been loaded in the current conversation

### Example Usage

If asked to "create a PDF report", you would:
1. Invoke the appropriate skill tool (e.g., \`skills_pdf\`)
2. Read the expanded skill instructions
3. Follow the skill's guidance for PDF creation
4. Use \`read_skill_file\` if templates or examples are needed`;
}

/**
 * Format the AGENTS.md content from memory files
 *
 * @param files - Memory files (CLAUDE.md) from various sources
 * @returns Formatted AGENTS.md content
 */
export function formatAgentsMd(files: MemoryFile[]): string {
  const memoryFileContent = files
    .map((file) => file.content.trim())
    .filter((content) => content.length > 0);

  if (memoryFileContent.length === 0) {
    return "";
  }

  return memoryFileContent.join("\n\n---\n\n") + "\n";
}

/**
 * Format the SKILLS.md content from skill information
 *
 * @param skills - Skill information for instruction generation
 * @returns Formatted SKILLS.md content
 */
export function formatSkillsMd(skills: Skill[]): string {
  if (skills.length === 0) {
    return "";
  }

  return `# Skills

${generateSkillsSection(skills)}
`;
}
