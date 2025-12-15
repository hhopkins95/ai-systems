import { readFile, realpath } from "fs/promises";
import { join, basename, extname } from "path";
import fg from "fast-glob";
import type { Rule, RuleWithSource, EntitySourceType } from "@ai-systems/shared-types";
import { parseFrontmatter } from "../utils/frontmatter.js";
import { getClaudeDir, getRulesDir, getProjectClaudeDir } from "../utils/paths.js";

/**
 * Loader for rule files (CLAUDE.md and rules/*.md)
 */
export class RulesLoader {
  /**
   * Load all rule files from global and project locations
   * @param homeDir - User home directory (for global rules)
   * @param projectDir - Project root directory (optional)
   * @returns Sorted array of RuleWithSource objects (global first, then project)
   */
  async loadRules(
    homeDir: string,
    projectDir?: string
  ): Promise<RuleWithSource[]> {
    const rules: RuleWithSource[] = [];

    // 1. Load global rules (~/.claude)
    const globalClaudeDir = getClaudeDir(join(homeDir, ".claude"));
    const globalRules = await this.loadRulesFromScope(globalClaudeDir, "global");
    rules.push(...globalRules);

    // 2. Load project rules (.claude)
    if (projectDir) {
      const projectRules = await this.loadProjectRules(projectDir);
      rules.push(...projectRules);
    }

    // Sort: global < project, main files first within each scope
    return this.sortRules(rules);
  }

  /**
   * Load rules from a specific scope (global or project .claude directory)
   */
  private async loadRulesFromScope(
    claudeDir: string,
    sourceType: EntitySourceType
  ): Promise<RuleWithSource[]> {
    const rules: RuleWithSource[] = [];

    // 1. Load main CLAUDE.md
    const mainClaudeMd = join(claudeDir, "CLAUDE.md");
    const mainRule = await this.readRuleFile(mainClaudeMd, sourceType, true);
    if (mainRule) {
      rules.push(mainRule);
    }

    // 2. Load rules from rules/ directory (recursively, following symlinks)
    const rulesDir = getRulesDir(claudeDir);
    const additionalRules = await this.loadRulesFromDirectory(rulesDir, sourceType);
    rules.push(...additionalRules);

    return rules;
  }

  /**
   * Load project-level rules including root CLAUDE.md
   */
  private async loadProjectRules(projectDir: string): Promise<RuleWithSource[]> {
    const rules: RuleWithSource[] = [];
    const projectClaudeDir = getProjectClaudeDir(projectDir);

    // 1. Check for CLAUDE.md at project root
    const rootClaudeMd = join(projectDir, "CLAUDE.md");
    const rootRule = await this.readRuleFile(rootClaudeMd, "project", true);
    if (rootRule) {
      rules.push(rootRule);
    }

    // 2. Check for .claude/CLAUDE.md (alternative location) - only if root doesn't exist
    if (!rootRule) {
      const dotClaudeMd = join(projectClaudeDir, "CLAUDE.md");
      const dotRule = await this.readRuleFile(dotClaudeMd, "project", true);
      if (dotRule) {
        rules.push(dotRule);
      }
    }

    // 3. Load rules from .claude/rules/
    const rulesDir = getRulesDir(projectClaudeDir);
    const additionalRules = await this.loadRulesFromDirectory(rulesDir, "project");
    rules.push(...additionalRules);

    return rules;
  }

  /**
   * Recursively load all .md files from a rules directory
   * Follows symlinks
   */
  private async loadRulesFromDirectory(
    rulesDir: string,
    sourceType: EntitySourceType
  ): Promise<RuleWithSource[]> {
    const rules: RuleWithSource[] = [];

    try {
      // Use fast-glob to find all .md files recursively, following symlinks
      const mdFiles = await fg("**/*.md", {
        cwd: rulesDir,
        absolute: true,
        followSymbolicLinks: true,
        onlyFiles: true,
      });

      for (const filePath of mdFiles) {
        const rule = await this.readRuleFile(filePath, sourceType, false);
        if (rule) {
          rules.push(rule);
        }
      }
    } catch (error) {
      // Directory doesn't exist - that's OK
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn(`Error loading rules from ${rulesDir}:`, error);
      }
    }

    return rules;
  }

  /**
   * Read and parse a single rule file
   */
  private async readRuleFile(
    filePath: string,
    sourceType: EntitySourceType,
    isMain: boolean
  ): Promise<RuleWithSource | null> {
    try {
      // Resolve symlinks to get the actual file
      const resolvedPath = await realpath(filePath);
      const rawContent = await readFile(resolvedPath, "utf-8");
      const parsed = parseFrontmatter<Record<string, unknown>>(rawContent);

      const fileName = basename(filePath);
      const name = isMain ? "CLAUDE" : basename(fileName, extname(fileName));

      // Extract paths from frontmatter if present
      const paths = parsed.data.paths as string | undefined;

      return {
        name,
        content: parsed.content,
        metadata: {
          paths,
          isMain,
          ...parsed.data,
        },
        source: {
          type: sourceType,
          path: filePath,
        },
      };
    } catch {
      return null;
    }
  }

  /**
   * Sort rules by precedence: global < project, main files first
   */
  private sortRules(rules: RuleWithSource[]): RuleWithSource[] {
    const scopeOrder: Record<EntitySourceType, number> = {
      global: 0,
      project: 1,
      plugin: 2, // Plugins last if ever used
    };

    return rules.sort((a, b) => {
      const sourceTypeA = a.source?.type ?? "global";
      const sourceTypeB = b.source?.type ?? "global";

      // First by scope
      const scopeDiff = scopeOrder[sourceTypeA] - scopeOrder[sourceTypeB];
      if (scopeDiff !== 0) return scopeDiff;

      // Within same scope: main files first
      if (a.metadata.isMain && !b.metadata.isMain) return -1;
      if (!a.metadata.isMain && b.metadata.isMain) return 1;

      // Then alphabetically by name
      return a.name.localeCompare(b.name);
    });
  }
}
