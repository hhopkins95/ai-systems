/**
 * Tests for Claude SDK converter parity
 *
 * Verifies that building state via streaming (raw SDK messages)
 * produces the same result as loading from transcript.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type {CombinedClaudeTranscript} from '@ai-systems/shared-types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DATA_DIR = __dirname;
const OUTPUT_DIR = __dirname


const mainTranscript = readFileSync(join(TEST_DATA_DIR, 'main-transcript.jsonl'), 'utf-8');

const subagentTranscript = readFileSync(join(TEST_DATA_DIR, 'subagent-transcript.jsonl'), 'utf-8');

const subagentId = 'a9b844f'


const combinedTranscript: CombinedClaudeTranscript = {
  main: mainTranscript,
  subagents: [
    {
      id: subagentId,
      transcript: subagentTranscript,
    },
  ],
};

writeFileSync(join(OUTPUT_DIR, 'combined-transcript.json'), JSON.stringify(combinedTranscript, null, 2));