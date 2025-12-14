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
import { loadAgentProfile } from '../src/core/index.js';
import type { AgentProfile } from '@ai-systems/shared-types';
import { setupTestWorkspace, TEST_PROJECT_DIR, TEST_CLAUDE_HOME_DIR } from './test-setup.js';

// ============================================================================
// Configuration - Edit these as needed
// ============================================================================

// Minimal profile - no custom entities to avoid ClaudeEntityManager complexity
const TEST_PROFILE: AgentProfile = {
  id: 'test-profile',
  name: 'Test Profile',
  description: 'A test agent profile',
  customEntities: {},
};

// ============================================================================
// Test
// ============================================================================

async function main() {
  const sessionId = `test-profile-${randomUUID().slice(0, 8)}`;

  console.log('='.repeat(60));
  console.log('Test: Load Agent Profile');
  console.log('='.repeat(60));
  console.log(`Profile: ${TEST_PROFILE.name}`);
  console.log(`Session: ${sessionId}`);
  console.log(`Project Dir: ${TEST_PROJECT_DIR}`);
  console.log(`Claude Home: ${TEST_CLAUDE_HOME_DIR}`);
  console.log('='.repeat(60));
  console.log('');

  // Clean and create test workspace
  await setupTestWorkspace();

  const input = {
    projectDirPath: TEST_PROJECT_DIR,
    sessionId,
    agentProfile: TEST_PROFILE,
    architectureType: 'claude-sdk' as const,
    claudeHomeDir: TEST_CLAUDE_HOME_DIR,
  };

  const startTime = Date.now();

  try {
    console.log('Loading agent profile...\n');

    const result = await loadAgentProfile(input);

    const duration = Date.now() - startTime;

    if (!result.success) {
      throw new Error(`Load failed: ${result.errors?.join(', ')}`);
    }

    console.log('Files written:');
    for (const file of result.filesWritten) {
      console.log(`  - ${file}`);
    }
    console.log('');

    // Verify .claude directory was created in project
    const projectClaudeDir = resolve(TEST_PROJECT_DIR, '.claude');
    if (!existsSync(projectClaudeDir)) {
      throw new Error('.claude directory was not created in project');
    }

    // List what's in project .claude
    console.log('Verifying project .claude directory:');
    const claudeContents = await readdir(projectClaudeDir, { recursive: true });
    for (const item of claudeContents) {
      console.log(`  - .claude/${item}`);
    }
    console.log('');

    // Check for MCP config
    const mcpConfigPath = resolve(projectClaudeDir, '.mcp.json');
    if (existsSync(mcpConfigPath)) {
      const mcpConfig = await readFile(mcpConfigPath, 'utf-8');
      console.log('MCP Config:');
      console.log(mcpConfig);
    }

    console.log('='.repeat(60));
    console.log(`PASS - Profile loaded in ${duration}ms`);
    console.log('='.repeat(60));
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('='.repeat(60));
    console.error(`FAIL - ${error instanceof Error ? error.message : error}`);
    console.error(`After ${duration}ms`);
    console.error('='.repeat(60));
    process.exit(1);
  }
}

main();
