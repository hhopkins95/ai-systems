/**
 * Test: Execute Query with OpenCode SDK
 *
 * Calls executeQuery directly with opencode architecture.
 * Run with: npx tsx test/test-execute-opencode.ts
 *
 * Requires:
 * - OPENCODE_API_KEY environment variable
 * - OpenCode CLI installed and available in PATH
 */

import { randomUUID } from 'crypto';
import { resolve } from 'path';
import { mkdir } from 'fs/promises';
import { executeQuery } from '../src/core/index.js';

// ============================================================================
// Configuration - Edit these as needed
// ============================================================================

const PROMPT = 'What is 2 + 2? Reply with just the number.';
const MODEL = 'anthropic/claude-sonnet-4-20250514';

// ============================================================================
// Test
// ============================================================================

async function main() {
  const testDir = resolve(import.meta.dirname, 'workspace');
  const sessionId = `test-opencode-${randomUUID().slice(0, 8)}`;

  console.log('='.repeat(60));
  console.log('Test: Execute Query (OpenCode)');
  console.log('='.repeat(60));
  console.log(`Prompt: "${PROMPT}"`);
  console.log(`Model: ${MODEL}`);
  console.log(`Session: ${sessionId}`);
  console.log(`Workspace: ${testDir}`);
  console.log('='.repeat(60));
  console.log('');

  // Check for API key
  if (!process.env.OPENCODE_API_KEY) {
    console.error('ERROR: OPENCODE_API_KEY environment variable not set');
    process.exit(1);
  }

  // Ensure workspace exists
  await mkdir(testDir, { recursive: true });

  const input = {
    prompt: PROMPT,
    architecture: 'opencode' as const,
    sessionId,
    cwd: testDir,
    model: MODEL,
  };

  console.log('Streaming events:\n');

  let eventCount = 0;
  const startTime = Date.now();

  try {
    for await (const event of executeQuery(input)) {
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
