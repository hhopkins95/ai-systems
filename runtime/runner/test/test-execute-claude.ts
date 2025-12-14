/**
 * Test: Execute Query with Claude SDK
 *
 * Calls executeClaudeQuery directly.
 * Run with: npx tsx test/test-execute-claude.ts
 */

import { randomUUID } from 'crypto';
import { executeClaudeQuery } from '../src/core/index.js';
import { setupTestWorkspace, TEST_PROJECT_DIR } from './test-setup.js';

// ============================================================================
// Configuration - Edit these as needed
// ============================================================================

const PROMPT = 'What is 2 + 2? Reply with just the number.';

// ============================================================================
// Test
// ============================================================================

async function main() {
  const sessionId = `test-claude-${randomUUID().slice(0, 8)}`;

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

  const input = {
    prompt: PROMPT,
    architecture: 'claude-sdk' as const,
    sessionId,
    cwd: TEST_PROJECT_DIR,
  };

  console.log('Streaming events:\n');

  let eventCount = 0;
  const startTime = Date.now();

  try {
    for await (const event of executeClaudeQuery(input)) {
      eventCount++;

      // Pretty print the event
      if (event.type === 'block_start') {
        console.log(`[${event.type}] block=${event.block.type}`);
      } else if (event.type === 'block_delta') {
        // Show text deltas inline
        if ('text' in event.delta) {
          process.stdout.write(event.delta.text);
        }
      } else if (event.type === 'block_complete') {
        if (event.block.type === 'text') {
          console.log(`\n[${event.type}] text block complete`);
        } else if (event.block.type === 'system') {
          const block = event.block;
          if (block.subtype === 'log') {
            console.log(`[log:${block.metadata?.level}] ${block.message}`);
          } else if (block.subtype === 'result') {
            console.log(`[result] ${block.message}`);
          }
        } else {
          console.log(`[${event.type}] ${event.block.type}`);
        }
      }
    }

    const duration = Date.now() - startTime;
    console.log('\n');
    console.log('='.repeat(60));
    console.log(`PASS - ${eventCount} events in ${duration}ms`);
    console.log('='.repeat(60));
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('\n');
    console.error('='.repeat(60));
    console.error(`FAIL - ${error instanceof Error ? error.message : error}`);
    console.error(`After ${eventCount} events in ${duration}ms`);
    console.error('='.repeat(60));
    process.exit(1);
  }
}

main();
