import { readFile, readdir } from "fs/promises";
import { join, basename } from "path";
import type { Hook, EntitySource, HookEvent, HookMatcher } from "@ai-systems/shared-types";
import { getHooksDir } from "../utils/paths.js";

/**
 * Loader for Claude Code hooks (hooks.json files)
 */
export class HookLoader {
  /**
   * Load all hooks from a base directory
   * @param baseDir - Base directory (e.g., ~/.claude or plugin path)
   * @param source - Source information for loaded hooks
   */
  async loadHooks(
    baseDir: string,
    source: Omit<EntitySource, "path">
  ): Promise<Hook[]> {
    const hooksDir = getHooksDir(baseDir);
    const hooks: Hook[] = [];

    // Try to load hooks.json directly
    const hooksJsonPath = join(hooksDir, "hooks.json");
    const hook = await this.loadHookFile(hooksJsonPath, source);
    if (hook) {
      hooks.push(hook);
    }

    // Also check for individual hook files
    try {
      const files = await readdir(hooksDir);

      for (const file of files) {
        if (!file.endsWith(".json") || file === "hooks.json") continue;

        const hookFile = await this.loadHookFile(
          join(hooksDir, file),
          source
        );
        if (hookFile) {
          hooks.push(hookFile);
        }
      }
    } catch (error) {
      // hooks/ directory doesn't exist - that's OK
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn(`Error loading hooks from ${baseDir}:`, error);
      }
    }

    return hooks;
  }

  /**
   * Load hooks from explicit paths (relative to baseDir)
   * Used when marketplace.json specifies explicit hook paths
   */
  async loadHooksFromPaths(
    baseDir: string,
    hookPaths: string[],
    source: Omit<EntitySource, "path">
  ): Promise<Hook[]> {
    const hooks: Hook[] = [];

    for (const relativePath of hookPaths) {
      const hookFile = join(baseDir, relativePath);
      try {
        const hook = await this.loadHookFile(hookFile, source);
        if (hook) {
          hooks.push(hook);
        }
      } catch (error) {
        // Hook file doesn't exist or can't be read
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          console.warn(`Error loading hook from ${hookFile}:`, error);
        }
      }
    }

    return hooks;
  }

  /**
   * Load a single hook file
   */
  async loadHookFile(
    filePath: string,
    source: Omit<EntitySource, "path">
  ): Promise<Hook | null> {
    try {
      const rawContent = await readFile(filePath, "utf-8");
      const hookConfig = JSON.parse(rawContent) as Partial<
        Record<HookEvent, HookMatcher[]>
      >;

      return {
        name: basename(filePath, ".json"),
        path: filePath,
        source: { ...source, path: filePath },
        hooks: hookConfig,
      };
    } catch (error) {
      // File doesn't exist or can't be parsed
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn(`Failed to load hook at ${filePath}:`, error);
      }
      return null;
    }
  }
}
