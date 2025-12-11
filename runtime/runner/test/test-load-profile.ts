/**
 * Test: Load Agent Profile
 *
 * Calls loadAgentProfile directly and verifies files are written.
 * Run with: npx tsx test/test-load-profile.ts
 */

import { randomUUID } from 'crypto';
import { resolve } from 'path';
import { mkdir, rm, readdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { loadAgentProfile } from '../src/core/index.js';
import type { AgentProfile } from '@ai-systems/shared-types';

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
  const testDir = resolve(import.meta.dirname, 'workspace', 'profile-test');
  const sessionId = `test-profile-${randomUUID().slice(0, 8)}`;

  console.log('='.repeat(60));
  console.log('Test: Load Agent Profile');
  console.log('='.repeat(60));
  console.log(`Profile: ${TEST_PROFILE.name}`);
  console.log(`Session: ${sessionId}`);
  console.log(`Workspace: ${testDir}`);
  console.log('='.repeat(60));
  console.log('');

  // Clean and create workspace
  if (existsSync(testDir)) {
    await rm(testDir, { recursive: true });
  }
  await mkdir(testDir, { recursive: true });

  const input = {
    projectDirPath: testDir,
    sessionId,
    agentProfile: TEST_PROFILE,
    architectureType: 'claude-sdk' as const,
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

    // Verify .claude directory was created
    const claudeDir = resolve(testDir, '.claude');
    if (!existsSync(claudeDir)) {
      throw new Error('.claude directory was not created');
    }

    // List what's in .claude
    console.log('Verifying .claude directory:');
    const claudeContents = await readdir(claudeDir, { recursive: true });
    for (const item of claudeContents) {
      console.log(`  - .claude/${item}`);
    }
    console.log('');

    // Check for MCP config
    const mcpConfigPath = resolve(claudeDir, '.mcp.json');
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
