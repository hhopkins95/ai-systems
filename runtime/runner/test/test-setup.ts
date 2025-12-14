/**
 * Test Setup Utilities
 *
 * Provides shared test workspace setup for agent runner tests.
 * Creates an isolated environment with a custom claude home directory
 * to avoid polluting the user's real ~/.claude configuration.
 */

import { resolve } from 'path';
import { rm, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

// Root test workspace directory
export const TEST_WORKSPACE_ROOT = resolve(import.meta.dirname, 'test-workspace');

// Claude home config directory (mimics ~/.claude)
export const TEST_CLAUDE_HOME_DIR = resolve(TEST_WORKSPACE_ROOT, '.claude');

// Project workspace directory
export const TEST_PROJECT_DIR = resolve(TEST_WORKSPACE_ROOT, 'workspace');

/**
 * Clean and create the test workspace.
 * Call at the start of each test for a fresh environment.
 *
 * Creates:
 * - test-workspace/.claude/ (mimics ~/.claude for sessions/plugins)
 * - test-workspace/workspace/ (project directory for tests)
 */
export async function setupTestWorkspace(): Promise<void> {
  // Remove existing test workspace
  if (existsSync(TEST_WORKSPACE_ROOT)) {
    await rm(TEST_WORKSPACE_ROOT, { recursive: true });
  }

  // Create fresh directories
  await mkdir(TEST_CLAUDE_HOME_DIR, { recursive: true });
  await mkdir(TEST_PROJECT_DIR, { recursive: true });
}
