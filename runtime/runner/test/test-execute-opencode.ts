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
import { executeOpencodeQuery, loadSessionTranscript, readSessionTranscript } from '../src/core/index.js';
import { setupTestWorkspace, TEST_WORKSPACE_ROOT } from './test-setup.js';
import path from 'path';
import { ExecuteQueryArgs } from '../src/types.js';
import fs from 'fs';
/**
 * Generate a session ID in the appropriate format for the architecture
 */
function generateSessionId(): string {
    // OpenCode format: ses_<timestamp_hex>_<random>
    const timestamp = Date.now();
    const timeBytes = timestamp.toString(16).padStart(12, '0');
    const random = Math.random().toString(36).substring(2, 13);
    return `ses_${timeBytes}_${random}`;
}
// ============================================================================
// Configuration - Edit these as needed
// ============================================================================

const PROMPT = `Do the following in order : 

1. Load a skill.Any Skill will do.

2. Launch a subagent to write a file to the workspace called 'subagent-test.txt' with the content 'Hello world from the subagent!'.Use the Task tool to do this.

3. Write a file to the workspace called 'test.txt' with the content 'Hello world from the main agent!'.


Do not ask any questions first, please just immediately do the steps above.Use thinking tokens to begin.`;
const MODEL = 'big-pickle';

// ============================================================================
// Test
// ============================================================================

async function main() {
  const sessionId = generateSessionId();

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
  // await setupTestWorkspace();

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

  let rawSDKMessages: any[] = [];
  for await (const event of executeOpencodeQuery(input)) {
      eventCount++;

      if (event.type === 'log' && event.payload.message === 'RAW SDK MESSAGE') {
        rawSDKMessages.push(event.payload.data);
      }

      console.log(JSON.stringify(event, null, 2));

  }

  // write the raw sdk messages to a jsonl file 
  fs.writeFileSync(path.join(TEST_WORKSPACE_ROOT, 'raw-opencode-messages.jsonl'), rawSDKMessages.map(message => JSON.stringify(message)).join('\n'));


  const loadedTranscript = await readSessionTranscript({
    baseWorkspacePath: TEST_WORKSPACE_ROOT,
    sessionId,
    architecture: 'opencode',
  });

  // write the loaded transcript to a json file 
  fs.writeFileSync(path.join(TEST_WORKSPACE_ROOT, 'main-opencode-transcript.json'), loadedTranscript.transcript || '');


  const duration = Date.now() - startTime;
  console.log('\n');
  console.log('='.repeat(60));
  console.log(`PASS - ${eventCount} events in ${duration}ms`);
  console.log('='.repeat(60));

  // Exit explicitly - the OpenCode server connection keeps the process alive otherwise
  process.exit(0);
}

main();
