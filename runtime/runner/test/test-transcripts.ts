/**
 * Test: Load and Read Session Transcript
 *
 * Tests the round-trip of loading and reading a session transcript.
 * Run with: npx tsx test/test-transcripts.ts
 */

import { randomUUID } from 'crypto';
import { loadSessionTranscript, readSessionTranscript } from '../src/core/index.js';
import type { CombinedClaudeTranscript } from '@hhopkins/agent-converters/claude-sdk';
import { setupTestWorkspace, TEST_PROJECT_DIR, TEST_CLAUDE_HOME_DIR } from './test-setup.js';

// ============================================================================
// Configuration - Edit these as needed
// ============================================================================

// A minimal mock transcript for testing
const MOCK_TRANSCRIPT: CombinedClaudeTranscript = {
  main: `{"type":"system","message":"Session started"}
{"type":"user","message":{"role":"user","content":"Hello"}}
{"type":"assistant","message":{"role":"assistant","content":"Hi there!"}}`,
  subagents: [],
};

// ============================================================================
// Test
// ============================================================================

async function main() {
  const sessionId = `test-transcript-${randomUUID().slice(0, 8)}`;

  console.log('='.repeat(60));
  console.log('Test: Load and Read Session Transcript');
  console.log('='.repeat(60));
  console.log(`Session: ${sessionId}`);
  console.log(`Project Dir: ${TEST_PROJECT_DIR}`);
  console.log(`Claude Home: ${TEST_CLAUDE_HOME_DIR}`);
  console.log('='.repeat(60));
  console.log('');

  // Clean and create test workspace
  await setupTestWorkspace();

  const startTime = Date.now();

  try {
    // Step 1: Load transcript
    console.log('Step 1: Loading transcript...');

    const loadResult = await loadSessionTranscript({
      projectDirPath: TEST_PROJECT_DIR,
      sessionId,
      sessionTranscript: JSON.stringify(MOCK_TRANSCRIPT),
      architectureType: 'claude-sdk',
      claudeHomeDir: TEST_CLAUDE_HOME_DIR,
    });

    if (!loadResult.success) {
      throw new Error(`Load failed: ${loadResult.errors?.join(', ')}`);
    }

    console.log(`  Transcript written to: ${loadResult.transcriptPath}`);
    console.log('');

    // Step 2: Read transcript back
    console.log('Step 2: Reading transcript...');

    const readResult = await readSessionTranscript({
      sessionId,
      architecture: 'claude-sdk',
      projectDir: TEST_PROJECT_DIR,
      claudeHomeDir: TEST_CLAUDE_HOME_DIR,
    });

    if (!readResult.success || !readResult.transcript) {
      throw new Error(`Read failed: ${readResult.error}`);
    }

    console.log('  Transcript read successfully');
    console.log('');

    // Step 3: Verify round-trip
    console.log('Step 3: Verifying round-trip...');

    const readTranscript = JSON.parse(readResult.transcript) as CombinedClaudeTranscript;

    // Compare main transcript
    if (readTranscript.main !== MOCK_TRANSCRIPT.main) {
      console.error('  Original main:');
      console.error(`    ${MOCK_TRANSCRIPT.main.slice(0, 100)}...`);
      console.error('  Read main:');
      console.error(`    ${readTranscript.main.slice(0, 100)}...`);
      throw new Error('Main transcript content mismatch');
    }

    console.log('  Main transcript matches');

    // Compare subagents count
    if (readTranscript.subagents.length !== MOCK_TRANSCRIPT.subagents.length) {
      throw new Error(
        `Subagent count mismatch: expected ${MOCK_TRANSCRIPT.subagents.length}, got ${readTranscript.subagents.length}`
      );
    }

    console.log(`  Subagent count matches (${readTranscript.subagents.length})`);

    const duration = Date.now() - startTime;
    console.log('');
    console.log('='.repeat(60));
    console.log(`PASS - Round-trip completed in ${duration}ms`);
    console.log('='.repeat(60));
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('');
    console.error('='.repeat(60));
    console.error(`FAIL - ${error instanceof Error ? error.message : error}`);
    console.error(`After ${duration}ms`);
    console.error('='.repeat(60));
    process.exit(1);
  }
}

main();
