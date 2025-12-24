/**
 * Tests for Claude SDK converter parity
 *
 * Verifies that building state via streaming (raw SDK messages)
 * produces the same result as loading from transcript.
 */

import type { CombinedOpenCodeTranscript } from '@ai-systems/shared-types';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DATA_DIR = __dirname;
const OUTPUT_DIR = __dirname


const mainTranscript = readFileSync(join(TEST_DATA_DIR, 'main-opencode-transcript.json'), 'utf-8');

const combinedTranscript: CombinedOpenCodeTranscript = {
  main: mainTranscript,
  subagents: [],
};

writeFileSync(join(OUTPUT_DIR, 'combined-opencode-transcript.json'), JSON.stringify(combinedTranscript, null, 2));