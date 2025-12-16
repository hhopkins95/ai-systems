/**
 * Test: Execute Query with Claude SDK
 *
 * Calls executeClaudeQuery directly.
 * Run with: npx tsx test/test-execute-claude.ts
 */

import { randomUUID } from 'crypto';
import path from 'path';
import { executeClaudeQuery } from '../src/core/index.js';
import { setupTestWorkspace, TEST_WORKSPACE_ROOT } from './test-setup.js';
import { ExecuteQueryArgs } from '../src/types.js';

const TEST_PROJECT_DIR = path.join(TEST_WORKSPACE_ROOT, 'workspace');

// ============================================================================
// Configuration - Edit these as needed
// ============================================================================

const PROMPT = 'What is 2 + 2? Reply with just the number.';

// ============================================================================
// Test
// ============================================================================

async function main() {
  const sessionId = randomUUID()

  console.log('='.repeat(60));
  console.log('Test: Execute Query (Claude SDK)');
  console.log('='.repeat(60));
  console.log(`Prompt: "${PROMPT}"`);
  console.log(`Session: ${sessionId}`);
  console.log(`Workspace: ${TEST_PROJECT_DIR}`);
  console.log('='.repeat(60));
  console.log('');

  // Clean and create test workspace
  await setupTestWorkspace();

  const input: ExecuteQueryArgs = {
    prompt: PROMPT,
    architecture: 'claude-sdk' as const,
    sessionId,
    baseWorkspacePath: TEST_WORKSPACE_ROOT,
  };

  console.log('Streaming events:\n');

  let eventCount = 0;
  const startTime = Date.now();

    for await (const event of executeClaudeQuery(input)) {
      eventCount++;

      // Pretty print the event
      console.log(JSON.stringify(event, null, 2));
    }
}

main();
