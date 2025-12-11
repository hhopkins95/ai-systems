/**
 * Workspace management - creates and cleans up test directories
 */

import { mkdir, mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { Workspace, WorkspaceOptions } from '../types.js';

const WORKSPACE_PREFIX = 'runner-harness-';

/**
 * Create a workspace directory for testing
 *
 * @param options - Workspace configuration options
 * @returns Workspace object with path and cleanup function
 */
export async function createWorkspace(
  options: WorkspaceOptions = {}
): Promise<Workspace> {
  const { baseDir, keep, clean } = options;
  let workspacePath: string;

  if (baseDir) {
    // Use specified directory
    workspacePath = baseDir;

    if (clean) {
      // Clean existing directory
      await rm(workspacePath, { recursive: true, force: true });
    }

    // Ensure directory exists
    await mkdir(workspacePath, { recursive: true });
  } else {
    // Create temp directory
    const prefix = join(tmpdir(), WORKSPACE_PREFIX);
    workspacePath = await mkdtemp(prefix);
  }

  // Create required subdirectories that runners expect
  await mkdir(join(workspacePath, '.claude'), { recursive: true });

  return {
    path: workspacePath,
    cleanup: async () => {
      // Only clean up temp directories (not user-specified ones)
      // And only if --keep wasn't specified
      if (!keep && !baseDir) {
        await rm(workspacePath, { recursive: true, force: true });
      }
    },
  };
}

/**
 * Ensure a directory exists, creating it if necessary
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}
