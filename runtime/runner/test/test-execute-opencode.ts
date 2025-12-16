/**
 * Test: Execute Query with OpenCode SDK
 *
 * Calls executeOpencodeQuery directly.
 * Run with: npx tsx test/test-execute-opencode.ts
 *
 * Requires:
 * - OPENCODE_API_KEY environment variable
 * - OpenCode CLI installed and available in PATH
 */

import { randomUUID } from 'crypto';
import { executeOpencodeQuery } from '../src/core/index.js';
import { setupTestWorkspace, TEST_WORKSPACE_ROOT } from './test-setup.js';
import path from 'path';
import { ExecuteQueryArgs } from '../src/types.js';

// ============================================================================
// Configuration - Edit these as needed
// ============================================================================

const PROMPT = 'What is 2 + 2? Reply with just the number.';
const MODEL = 'anthropic/claude-sonnet-4-20250514';

// ============================================================================
// Test
// ============================================================================

async function main() {
  const sessionId = `test-opencode-${randomUUID().slice(0, 8)}`;

  console.log('='.repeat(60));
  console.log('Test: Execute Query (OpenCode)');
  console.log('='.repeat(60));
  console.log(`Prompt: "${PROMPT}"`);
  console.log(`Model: ${MODEL}`);
  console.log(`Session: ${sessionId}`);
  console.log(`Workspace: ${TEST_WORKSPACE_ROOT}`);
  console.log('='.repeat(60));
  console.log('');

  // Check for API key
  if (!process.env.OPENCODE_API_KEY) {
    console.error('ERROR: OPENCODE_API_KEY environment variable not set');
    process.exit(1);
  }

  // Clean and create test workspace
  await setupTestWorkspace();

  const input: ExecuteQueryArgs = {
    prompt: PROMPT,
    architecture: 'opencode' as const,
    sessionId,
    model: MODEL,
    baseWorkspacePath: TEST_WORKSPACE_ROOT,
  };

  console.log('Streaming events:\n');

  let eventCount = 0;
  const startTime = Date.now();

  
    for await (const event of executeOpencodeQuery(input)) {
      eventCount++;

      console.log(JSON.stringify(event, null, 2));
    

    const duration = Date.now() - startTime;
    console.log('\n');
    console.log('='.repeat(60));
    console.log(`PASS - ${eventCount} events in ${duration}ms`);
    console.log('='.repeat(60));
  }
}

main();
