import { readFile, readdir } from "fs/promises";
import { join, basename } from "path";
import type { Command, EntitySource, CommandMetadata } from "../types.js";
import {
  parseFrontmatter,
  extractFirstLine,
} from "../utils/frontmatter.js";
import { getCommandsDir } from "../utils/paths.js";

/**
 * Loader for Claude Code commands (markdown files in commands/)
 */
export class CommandLoader {
  /**
   * Load all commands from a base directory
   * @param baseDir - Base directory (e.g., ~/.claude or plugin path)
   * @param source - Source information for loaded commands
   */
  async loadCommands(
    baseDir: string,
    source: Omit<EntitySource, "path">
  ): Promise<Command[]> {
    const commandsDir = getCommandsDir(baseDir);
    const commands: Command[] = [];

    try {
      const files = await readdir(commandsDir);

      for (const file of files) {
        if (!file.endsWith(".md")) continue;

        const command = await this.loadCommand(
          join(commandsDir, file),
          source
        );
        if (command) {
          commands.push(command);
        }
      }
    } catch (error) {
      // commands/ directory doesn't exist - that's OK
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn(`Error loading commands from ${baseDir}:`, error);
      }
    }

    return commands;
  }

  /**
   * Load a single command from its file path
   */
  async loadCommand(
    filePath: string,
    source: Omit<EntitySource, "path">
  ): Promise<Command | null> {
    try {
      const rawContent = await readFile(filePath, "utf-8");
      const { data, content } = parseFrontmatter<CommandMetadata>(rawContent);

      return {
        name: basename(filePath, ".md"),
        path: filePath,
        source: { ...source, path: filePath },
        description: data.description || extractFirstLine(content),
        content,
        metadata: data,
      };
    } catch (error) {
      console.warn(`Failed to load command at ${filePath}:`, error);
      return null;
    }
  }
}
