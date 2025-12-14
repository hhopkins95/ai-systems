/**
 * Run All Tests
 *
 * Runs all test scripts in sequence and reports results.
 * Run with: pnpm test or npx tsx test/run-all.ts
 */

import { spawn } from 'child_process';
import { resolve } from 'path';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

const TESTS = [
  { name: 'Load Profile', file: 'test-load-profile.ts' },
  { name: 'Claude Transcripts', file: 'test-claude-transcripts.ts' },
  { name: 'OpenCode Transcripts', file: 'test-opencode-transcripts.ts' },
  // Execution tests require API keys and running services
  // Uncomment to include them:
  // { name: 'Execute Claude', file: 'test-execute-claude.ts' },
  // { name: 'Execute OpenCode', file: 'test-execute-opencode.ts' },
];

async function runTest(testFile: string): Promise<{ passed: boolean; duration: number; error?: string }> {
  const testPath = resolve(import.meta.dirname, testFile);
  const startTime = Date.now();

  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', testPath], {
      stdio: 'inherit',
      shell: true,
    });

    child.on('close', (code) => {
      const duration = Date.now() - startTime;
      resolve({
        passed: code === 0,
        duration,
        error: code !== 0 ? `Exit code: ${code}` : undefined,
      });
    });

    child.on('error', (err) => {
      const duration = Date.now() - startTime;
      resolve({
        passed: false,
        duration,
        error: err.message,
      });
    });
  });
}

async function main() {
  console.log('');
  console.log('='.repeat(60));
  console.log('Running All Tests');
  console.log('='.repeat(60));
  console.log('');

  const results: TestResult[] = [];
  const overallStart = Date.now();

  for (const test of TESTS) {
    console.log(`\n${'─'.repeat(60)}\n`);

    const result = await runTest(test.file);
    results.push({
      name: test.name,
      ...result,
    });
  }

  const overallDuration = Date.now() - overallStart;

  // Summary
  console.log('');
  console.log('='.repeat(60));
  console.log('Test Summary');
  console.log('='.repeat(60));
  console.log('');

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  for (const result of results) {
    const status = result.passed ? '✓ PASS' : '✗ FAIL';
    const duration = `${result.duration}ms`;
    console.log(`  ${status}  ${result.name.padEnd(20)} ${duration}`);
    if (result.error) {
      console.log(`         └─ ${result.error}`);
    }
  }

  console.log('');
  console.log('─'.repeat(60));
  console.log(`  Total: ${results.length} tests, ${passed} passed, ${failed} failed`);
  console.log(`  Duration: ${overallDuration}ms`);
  console.log('='.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

main();
