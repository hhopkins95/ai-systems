/**
 * Test: Load Agent Profile
 *
 * Calls loadAgentProfile directly and verifies files are written.
 * Run with: npx tsx test/test-load-profile.ts
 */

import { randomUUID } from 'crypto';
import { resolve } from 'path';
import { readdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { loadAgentProfile, LoadAgentProfileInput } from '../src/core/index.js';
import { setupTestWorkspace, TEST_PROJECT_DIR, TEST_CLAUDE_HOME_DIR, TEST_WORKSPACE_ROOT } from './test-setup.js';
import { TestAgentProfile } from './fixtures/agents/agent-profile.js';





// ============================================================================
// Test
// ============================================================================
async function main() {
  const sessionId = `test-profile-${randomUUID().slice(0, 8)}`;
  // Clean and create test workspace
  await setupTestWorkspace();

  const input : LoadAgentProfileInput = {
    sessionDirPath: TEST_WORKSPACE_ROOT,
    agentProfile: TestAgentProfile,
    architectureType: 'opencode' as const, // use opencode since that does the claude set up as well 
  };

  try {

    const result = await loadAgentProfile(input);
    if (!result.success) {
      throw new Error(`Load failed: ${result.errors?.join(', ')}`);
    }
  } catch (error) {
    console.error(`FAIL - ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

main();
