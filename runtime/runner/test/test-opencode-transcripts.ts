/**
 * Test: Load and Export OpenCode Session Transcript
 *
 * Tests the round-trip of loading and exporting an OpenCode session transcript.
 * Uses real fixture files from the test/fixtures directory.
 *
 * Requires:
 * - OpenCode CLI installed and available in PATH
 *
 * Run with: npx tsx test/test-opencode-transcripts.ts
 */

import { resolve } from 'path';
import { readFile } from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { loadSessionTranscript, readSessionTranscript } from '../src/core/index.js';
import { setupTestWorkspace, TEST_PROJECT_DIR } from './test-setup.js';

const execFileAsync = promisify(execFile);

// ============================================================================
// Configuration - Fixture paths
// ============================================================================

const FIXTURES_DIR = resolve(import.meta.dirname, 'fixtures', 'sessions', 'opencode-transcripts');
const TRANSCRIPT_FILE = 'example.json';
const SESSION_ID = 'ses_52f1258d7ffev7nAoAJy2cUTMc';

/**
 * Check if OpenCode CLI is available.
 */
async function checkOpencodeAvailable(): Promise<boolean> {
  try {
    await execFileAsync('opencode', ['--version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load transcript fixture from disk.
 */
async function loadFixture(): Promise<string> {
  return readFile(resolve(FIXTURES_DIR, TRANSCRIPT_FILE), 'utf-8');
}

// ============================================================================
// Test
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('Test: Load and Export OpenCode Session Transcript');
  console.log('='.repeat(60));
  console.log(`Session: ${SESSION_ID}`);
  console.log(`Project Dir: ${TEST_PROJECT_DIR}`);
  console.log('='.repeat(60));
  console.log('');

  // Check for OpenCode CLI
  const opencodeAvailable = await checkOpencodeAvailable();
  if (!opencodeAvailable) {
    console.log('SKIP - OpenCode CLI not available');
    console.log('Install OpenCode CLI to run this test');
    process.exit(0);
  }

  // Clean and create test workspace
  await setupTestWorkspace();

  const startTime = Date.now();

  try {
    // Step 0: Load fixture
    console.log('Step 0: Loading fixture...');
    const fixtureContent = await loadFixture();
    const fixtureJson = JSON.parse(fixtureContent);
    console.log(`  Transcript: ${fixtureContent.length} chars`);
    console.log(`  Session ID: ${fixtureJson.info?.id || SESSION_ID}`);
    console.log('');

    // Step 1: Load transcript via opencode import
    console.log('Step 1: Importing transcript via OpenCode CLI...');

    const loadResult = await loadSessionTranscript({
      projectDirPath: TEST_PROJECT_DIR,
      sessionId: SESSION_ID,
      sessionTranscript: fixtureContent,
      architectureType: 'opencode',
    });

    if (!loadResult.success) {
      throw new Error(`Import failed: ${loadResult.errors?.join(', ')}`);
    }

    console.log('  Transcript imported successfully');
    console.log('');

    // Step 2: Export transcript back via opencode export
    console.log('Step 2: Exporting transcript via OpenCode CLI...');

    const readResult = await readSessionTranscript({
      sessionId: SESSION_ID,
      architecture: 'opencode',
      projectDir: TEST_PROJECT_DIR,
    });

    if (!readResult.success || !readResult.transcript) {
      throw new Error(`Export failed: ${readResult.error}`);
    }

    console.log('  Transcript exported successfully');
    console.log('');

    // Step 3: Verify round-trip
    console.log('Step 3: Verifying round-trip...');

    const exportedJson = JSON.parse(readResult.transcript);

    // Compare session IDs
    if (exportedJson.info?.id !== fixtureJson.info?.id) {
      throw new Error(
        `Session ID mismatch: expected ${fixtureJson.info?.id}, got ${exportedJson.info?.id}`
      );
    }

    console.log('  Session ID matches');

    // Compare message counts
    const expectedMessages = fixtureJson.messages?.length || 0;
    const actualMessages = exportedJson.messages?.length || 0;

    if (actualMessages !== expectedMessages) {
      throw new Error(`Message count mismatch: expected ${expectedMessages}, got ${actualMessages}`);
    }

    console.log(`  Message count matches (${actualMessages})`);

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
