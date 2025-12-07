import { readFile, readdir, access } from "fs/promises";
import { join, relative, dirname, basename } from "path";
import type {
  ClaudeMdFile,
  ClaudeMdNode,
  MemoryFileScope,
  ClaudeMdFrontmatter,
} from "../types.js";
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
   * @returns Hierarchical tree of CLAUDE.md nodes
   */
  async loadClaudeMdFiles(
    homeDir: string,
    projectDir?: string
  ): Promise<ClaudeMdNode[]> {
    const nodes: ClaudeMdNode[] = [];

    // 1. Check for global CLAUDE.md at ~/.claude/CLAUDE.md
    const globalClaudeDir = getClaudeDir(join(homeDir, ".claude"));
    const globalClaudePath = join(globalClaudeDir, "CLAUDE.md");
    const globalFile = await this.readClaudeMdFile(
      globalClaudePath,
      "global",
      0,
      "~/.claude"
    );

    if (globalFile) {
      nodes.push({
        type: "directory",
        name: "Global (~/.claude)",
        path: globalClaudeDir,
        children: [
          {
            type: "file",
            name: "CLAUDE.md",
            path: globalClaudePath,
            file: globalFile,
          },
        ],
      });
    }

    // 2. Check for project CLAUDE.md at project root
    if (projectDir) {
      const projectClaudePath = join(projectDir, "CLAUDE.md");
      const projectFile = await this.readClaudeMdFile(
        projectClaudePath,
        "project",
        1,
        "./CLAUDE.md"
      );

      if (projectFile) {
        nodes.push({
          type: "directory",
          name: "Project Root",
          path: projectDir,
          children: [
            {
              type: "file",
              name: "CLAUDE.md",
              path: projectClaudePath,
              file: projectFile,
            },
          ],
        });
      }

      // 3. Recursively search for nested CLAUDE.md files throughout project
      const nestedNodes = await this.findNestedClaudeMdFiles(
        projectDir,
        projectDir,
        2
      );

      if (nestedNodes.length > 0) {
        nodes.push({
          type: "directory",
          name: "Nested Context",
          path: projectDir,
          children: nestedNodes,
        });
      }
    }

    return nodes;
  }

  /**
   * Read and parse a single CLAUDE.md file
   */
  private async readClaudeMdFile(
    filePath: string,
    scope: MemoryFileScope,
    level: number,
    displayPath: string
  ): Promise<ClaudeMdFile | null> {
    try {
      const rawContent = await readFile(filePath, "utf-8");
      const parsed = parseFrontmatter<ClaudeMdFrontmatter>(rawContent);

      return {
        name: "CLAUDE.md",
        path: filePath,
        relativePath: displayPath,
        scope,
        level,
        content: parsed.content,
        frontmatter:
          Object.keys(parsed.data).length > 0 ? parsed.data : null,
        directoryPath: dirname(filePath),
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
    level: number
  ): Promise<ClaudeMdNode[]> {
    const nodes: ClaudeMdNode[] = [];

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
              level,
              relativePath
            );

            if (file) {
              nodes.push({
                type: "directory",
                name: entry.name,
                path: fullPath,
                children: [
                  {
                    type: "file",
                    name: "CLAUDE.md",
                    path: claudeMdPath,
                    file,
                  },
                ],
              });
            }
          } catch {
            // No CLAUDE.md in this directory, continue
          }

          // Recursively search subdirectories
          const childNodes = await this.findNestedClaudeMdFiles(
            fullPath,
            projectRoot,
            level + 1
          );

          if (childNodes.length > 0) {
            // If we already added this directory (because it has CLAUDE.md), add children to it
            const existingNode = nodes.find((n) => n.path === fullPath);
            if (existingNode && existingNode.children) {
              existingNode.children.push(...childNodes);
            } else {
              // Otherwise create a new directory node
              nodes.push({
                type: "directory",
                name: entry.name,
                path: fullPath,
                children: childNodes,
              });
            }
          }
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }

    return nodes;
  }
}
