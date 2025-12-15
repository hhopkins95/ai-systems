/**
 * File operation utilities
 */
import { mkdir, readdir, rm } from "fs/promises";
import { join } from "path";

/**
 * Ensure a directory exists, creating it if necessary
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

/**
 * Clear all contents of a directory (but keep the directory itself)
 */
export async function clearDirectory(dir: string): Promise<void> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      await rm(fullPath, { recursive: true });
    }
  } catch {
    // Directory might not exist - that's fine
  }
}
