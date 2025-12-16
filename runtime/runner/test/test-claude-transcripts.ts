/**
 * Test: Load and Read Session Transcript
 *
 * Tests the round-trip of loading and reading a session transcript.
 * Uses real fixture files from the test/fixtures directory.
 * Run with: npx tsx test/test-transcripts.ts
 */

import { resolve } from 'path';
import { readFile } from 'fs/promises';
import { loadSessionTranscript, readSessionTranscript } from '../src/core/index.js';
import type { CombinedClaudeTranscript } from '@hhopkins/agent-converters/claude-sdk';
import { setupTestWorkspace, TEST_WORKSPACE_ROOT } from './test-setup.js';

// ============================================================================
// Configuration - Fixture paths
// ============================================================================

const FIXTURES_DIR = resolve(import.meta.dirname, 'fixtures', 'sessions', 'claude-transcripts');
const MAIN_TRANSCRIPT_FILE = '0bfd826f-14ed-4e00-8015-75bf5f7fe33f.jsonl';
const SUBAGENT_TRANSCRIPT_FILE = 'agent-6d933f1b.jsonl';
const SESSION_ID = '0bfd826f-14ed-4e00-8015-75bf5f7fe33f';
const SUBAGENT_ID = '6d933f1b';

/**
 * Load transcript fixtures from disk.
 */
async function loadFixtures(): Promise<CombinedClaudeTranscript> {
  const mainContent = await readFile(resolve(FIXTURES_DIR, MAIN_TRANSCRIPT_FILE), 'utf-8');
  const subagentContent = await readFile(resolve(FIXTURES_DIR, SUBAGENT_TRANSCRIPT_FILE), 'utf-8');

  return {
    main: mainContent,
    subagents: [
      {
        id: SUBAGENT_ID,
        transcript: subagentContent,
      },
    ],
  };
}

// ============================================================================
// Test
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('Test: Load and Read Session Transcript');
  console.log('='.repeat(60));
  console.log(`Session: ${SESSION_ID}`);
  console.log(`Workspace Root: ${TEST_WORKSPACE_ROOT}`);
  console.log('='.repeat(60));
  console.log('');

  // Clean and create test workspace
  // await setupTestWorkspace();

  const startTime = Date.now();

  try {
    // Step 0: Load fixtures
    console.log('Step 0: Loading fixtures...');
    const fixtureTranscript = await loadFixtures();
    console.log(`  Main transcript: ${fixtureTranscript.main.length} chars`);
    console.log(`  Subagents: ${fixtureTranscript.subagents.length}`);
    console.log('');

    // Step 1: Load transcript
    console.log('Step 1: Writing transcript to test workspace...');

    const loadResult = await loadSessionTranscript({
      baseWorkspacePath: TEST_WORKSPACE_ROOT,
      sessionId: SESSION_ID,
      sessionTranscript: JSON.stringify(fixtureTranscript),
      architectureType: 'claude-sdk',
    });

    if (!loadResult.success) {
      throw new Error(`Load failed: ${loadResult.errors?.join(', ')}`);
    }

    console.log(`  Transcript written to: ${loadResult.transcriptPath}`);
    console.log('');

    // Step 2: Read transcript back
    console.log('Step 2: Reading transcript back...');

    const readResult = await readSessionTranscript({
      sessionId: SESSION_ID,
      architecture: 'claude-sdk',
      baseWorkspacePath: TEST_WORKSPACE_ROOT,
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
    if (readTranscript.main !== fixtureTranscript.main) {
      console.error('  Original main length:', fixtureTranscript.main.length);
      console.error('  Read main length:', readTranscript.main.length);
      console.error('  Original main preview:');
      console.error(`    ${fixtureTranscript.main.slice(0, 100)}...`);
      console.error('  Read main preview:');
      console.error(`    ${readTranscript.main.slice(0, 100)}...`);
      throw new Error('Main transcript content mismatch');
    }

    console.log('  Main transcript matches');

    // Compare subagents count
    if (readTranscript.subagents.length !== fixtureTranscript.subagents.length) {
      throw new Error(
        `Subagent count mismatch: expected ${fixtureTranscript.subagents.length}, got ${readTranscript.subagents.length}`
      );
    }

    console.log(`  Subagent count matches (${readTranscript.subagents.length})`);

    // Compare subagent content
    for (let i = 0; i < fixtureTranscript.subagents.length; i++) {
      const expected = fixtureTranscript.subagents[i];
      const actual = readTranscript.subagents[i];

      if (expected.id !== actual.id) {
        throw new Error(`Subagent ${i} ID mismatch: expected ${expected.id}, got ${actual.id}`);
      }

      if (expected.transcript !== actual.transcript) {
        throw new Error(`Subagent ${i} (${expected.id}) content mismatch`);
      }

      console.log(`  Subagent ${expected.id} matches`);
    }

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
