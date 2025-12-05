import { readFile, readdir, stat } from "fs/promises";
import { join, dirname, basename } from "path";
import fg from "fast-glob";
import type { Skill, EntitySource, SkillMetadata } from "../types.js";
import { parseFrontmatter, extractFirstParagraph } from "../utils/frontmatter.js";
import { getSkillsDir } from "../utils/paths.js";

/**
 * Loader for Claude Code skills (SKILL.md files)
 */
export class SkillLoader {
  /**
   * Load all skills from a base directory
   * @param baseDir - Base directory (e.g., ~/.claude or plugin path)
   * @param source - Source information for loaded skills
   * @param includeContents - Whether to load file contents
   * @param searchRootLevel - If true, search from baseDir directly instead of baseDir/skills
   */
  async loadSkills(
    baseDir: string,
    source: Omit<EntitySource, "path">,
    includeContents = false,
    searchRootLevel = false
  ): Promise<Skill[]> {
    const skills: Skill[] = [];

    // Determine which directory to search
    const searchDir = searchRootLevel ? baseDir : getSkillsDir(baseDir);

    try {
      const skillDirs = await this.findSkillDirectories(searchDir);
      for (const skillDir of skillDirs) {
        const skill = await this.loadSkill(skillDir, source, includeContents);
        if (skill) {
          skills.push(skill);
        }
      }
    } catch (error) {
      // Directory doesn't exist - that's OK
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn(`Error loading skills from ${searchDir}:`, error);
      }
    }

    return skills;
  }

  /**
   * Load skills from explicit paths (relative to baseDir)
   * Used when marketplace.json specifies explicit skill paths
   */
  async loadSkillsFromPaths(
    baseDir: string,
    skillPaths: string[],
    source: Omit<EntitySource, "path">,
    includeContents = false
  ): Promise<Skill[]> {
    const skills: Skill[] = [];

    for (const relativePath of skillPaths) {
      const skillDir = join(baseDir, relativePath);
      try {
        const skill = await this.loadSkill(skillDir, source, includeContents);
        if (skill) {
          skills.push(skill);
        }
      } catch (error) {
        // Skill directory doesn't exist or can't be read
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          console.warn(`Error loading skill from ${skillDir}:`, error);
        }
      }
    }

    return skills;
  }

  /**
   * Find all skill directories (containing SKILL.md)
   */
  private async findSkillDirectories(skillsDir: string): Promise<string[]> {
    try {
      const skillMdFiles = await fg("**/SKILL.md", {
        cwd: skillsDir,
        absolute: true,
        caseSensitiveMatch: false,
      });
      return skillMdFiles.map((f) => dirname(f));
    } catch {
      return [];
    }
  }

  /**
   * Load a single skill from its directory
   */
  async loadSkill(
    skillDir: string,
    source: Omit<EntitySource, "path">,
    includeContents = false
  ): Promise<Skill | null> {
    // Try to find SKILL.md (case-insensitive)
    const possibleNames = ["SKILL.md", "skill.md", "Skill.md"];
    let skillPath: string | null = null;
    let rawContent: string | null = null;

    for (const name of possibleNames) {
      const path = join(skillDir, name);
      try {
        rawContent = await readFile(path, "utf-8");
        skillPath = path;
        break;
      } catch {
        // Try next name
      }
    }

    if (!skillPath || !rawContent) {
      return null;
    }

    try {
      const { data, content } = parseFrontmatter<SkillMetadata>(rawContent);

      // Get all files in the skill directory
      const files = await this.listSkillFiles(skillDir);

      // Optionally load file contents
      let fileContents: Record<string, string> | undefined;
      if (includeContents) {
        fileContents = await this.readFileContents(skillDir, files);
      }

      return {
        name: data.name || basename(skillDir),
        path: skillPath,
        source: { ...source, path: skillPath },
        description: data.description || extractFirstParagraph(content),
        version: data.version,
        content,
        metadata: data,
        files,
        fileContents,
      };
    } catch (error) {
      console.warn(`Failed to parse skill at ${skillPath}:`, error);
      return null;
    }
  }

  /**
   * List all files in a skill directory (relative paths)
   */
  private async listSkillFiles(skillDir: string): Promise<string[]> {
    try {
      const files = await fg("**/*", {
        cwd: skillDir,
        onlyFiles: true,
      });
      return files;
    } catch {
      return [];
    }
  }

  /**
   * Read contents of specified files in a skill directory
   */
  async readFileContents(
    skillDir: string,
    files: string[]
  ): Promise<Record<string, string>> {
    const contents: Record<string, string> = {};

    for (const file of files) {
      try {
        const filePath = join(skillDir, file);
        const content = await readFile(filePath, "utf-8");
        contents[file] = content;
      } catch {
        // File can't be read, skip
      }
    }

    return contents;
  }
}
