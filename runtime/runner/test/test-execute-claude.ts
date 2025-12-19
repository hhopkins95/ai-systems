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
import fs from 'fs';
const TEST_PROJECT_DIR = path.join(TEST_WORKSPACE_ROOT, 'workspace');

// ============================================================================
// Configuration - Edit these as needed
// ============================================================================

const PROMPT = `

Do the following in order : 

1. Load a skill. Any Skill will do.

2. Launch a subagent to write a file to the workspace called 'subagent-test.txt' with the content 'Hello world from the subagent!'. Use the Task tool to do this.

3. Write a file to the workspace called 'test.txt' with the content 'Hello world from the main agent!'.


Do not ask any questions first, please just immediately do the steps above. Use thinking tokens to begin. 
`;

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
  // await setupTestWorkspace();

  const input: ExecuteQueryArgs = {
    prompt: PROMPT,
    architecture: 'claude-sdk' as const,
    sessionId,
    baseWorkspacePath: TEST_WORKSPACE_ROOT,
  };

  console.log('Streaming events:\n');

  let eventCount = 0;

  let rawSDKMessages: any[] = [];


    for await (const event of executeClaudeQuery(input)) {
      eventCount++;

      if (event.type === 'log' && event.payload.message === 'RAW SDK MESSAGE') {
        rawSDKMessages.push(event.payload.data);
      }

      // Pretty print the event
      // console.log(JSON.stringify(event, null, 2));
    }


    // write the raw sdk messages to a jsonl file 
    fs.writeFileSync(path.join(TEST_PROJECT_DIR, 'raw-sdk-messages.jsonl'), rawSDKMessages.map(message => JSON.stringify(message)).join('\n'));


}

main();
