import { readFile, readdir, access } from "fs/promises";
import { join, relative } from "path";
import type { MemoryFile, MemoryFileScope } from "../../../types/dist/index.js";
import { parseFrontmatter } from "../utils/frontmatter.js";
import { getClaudeDir } from "../utils/paths.js";

/**
 * Directories to exclude when searching for nested CLAUDE.md files
 */
const EXCLUDED_DIRS = [
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".git",
  ".next",
  ".cache",
  "__pycache__",
  "vendor",
  "target",
];

/**
 * Loader for CLAUDE.md context files
 */
export class ClaudeMdLoader {
  /**
   * Load all CLAUDE.md files from global, project, and nested locations
   * @param homeDir - User home directory (for global CLAUDE.md)
   * @param projectDir - Project root directory
   * @returns Sorted array of MemoryFile objects (global → project → nested)
   */
  async loadClaudeMdFiles(
    homeDir: string,
    projectDir?: string
  ): Promise<MemoryFile[]> {
    const files: MemoryFile[] = [];

    // 1. Check for global CLAUDE.md at ~/.claude/CLAUDE.md
    const globalClaudeDir = getClaudeDir(join(homeDir, ".claude"));
    const globalClaudePath = join(globalClaudeDir, "CLAUDE.md");
    const globalFile = await this.readClaudeMdFile(
      globalClaudePath,
      "global",
      0,
      "~/.claude/CLAUDE.md"
    );

    if (globalFile) {
      files.push(globalFile);
    }

    // 2. Check for project CLAUDE.md at project root
    if (projectDir) {
      const projectClaudePath = join(projectDir, "CLAUDE.md");
      const projectFile = await this.readClaudeMdFile(
        projectClaudePath,
        "project",
        0,
        "./CLAUDE.md"
      );

      if (projectFile) {
        files.push(projectFile);
      }

      // 3. Recursively search for nested CLAUDE.md files throughout project
      const nestedFiles = await this.findNestedClaudeMdFiles(
        projectDir,
        projectDir,
        1
      );
      files.push(...nestedFiles);
    }

    // Sort by scope priority: global first, then project, then nested (by depth, then path)
    return this.sortMemoryFiles(files);
  }

  /**
   * Read and parse a single CLAUDE.md file
   */
  private async readClaudeMdFile(
    filePath: string,
    scope: MemoryFileScope,
    depth: number,
    relativePath: string
  ): Promise<MemoryFile | null> {
    try {
      const rawContent = await readFile(filePath, "utf-8");
      const parsed = parseFrontmatter<Record<string, unknown>>(rawContent);

      return {
        path: filePath,
        content: parsed.content,
        frontmatter:
          Object.keys(parsed.data).length > 0 ? parsed.data : undefined,
        scope,
        relativePath: scope === "nested" ? relativePath : undefined,
        depth,
      };
    } catch {
      return null;
    }
  }

  /**
   * Recursively find nested CLAUDE.md files in subdirectories
   */
  private async findNestedClaudeMdFiles(
    dirPath: string,
    projectRoot: string,
    depth: number
  ): Promise<MemoryFile[]> {
    const files: MemoryFile[] = [];

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);

        // Skip hidden directories and excluded directories
        if (
          entry.name.startsWith(".") ||
          EXCLUDED_DIRS.includes(entry.name)
        ) {
          continue;
        }

        if (entry.isDirectory()) {
          // Check if this directory contains CLAUDE.md
          const claudeMdPath = join(fullPath, "CLAUDE.md");

          try {
            await access(claudeMdPath);
            const relativePath = relative(projectRoot, claudeMdPath);
            const file = await this.readClaudeMdFile(
              claudeMdPath,
              "nested",
              depth,
              relativePath
            );

            if (file) {
              files.push(file);
            }
          } catch {
            // No CLAUDE.md in this directory, continue
          }

          // Recursively search subdirectories
          const childFiles = await this.findNestedClaudeMdFiles(
            fullPath,
            projectRoot,
            depth + 1
          );
          files.push(...childFiles);
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }

    return files;
  }

  /**
   * Sort memory files by precedence: global → project → nested (by depth, then path)
   */
  private sortMemoryFiles(files: MemoryFile[]): MemoryFile[] {
    const scopeOrder: Record<MemoryFileScope, number> = {
      global: 0,
      project: 1,
      nested: 2,
    };

    return files.sort((a, b) => {
      const orderDiff = scopeOrder[a.scope] - scopeOrder[b.scope];
      if (orderDiff !== 0) return orderDiff;
      // For nested files, sort by depth then path
      if (a.scope === "nested" && b.scope === "nested") {
        const depthA = a.depth ?? 0;
        const depthB = b.depth ?? 0;
        if (depthA !== depthB) return depthA - depthB;
        return a.path.localeCompare(b.path);
      }
      return 0;
    });
  }
}
