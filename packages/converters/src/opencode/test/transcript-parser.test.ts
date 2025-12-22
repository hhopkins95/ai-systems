/**
 * Tests for OpenCode converter parity
 *
 * Verifies that building state via streaming (raw OpenCode events)
 * produces the same result as loading from transcript.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Event } from '@opencode-ai/sdk/v2';
import type { SessionConversationState, ConversationBlock, AnySessionEvent } from '@ai-systems/shared-types';
import { createInitialConversationState } from '@ai-systems/shared-types';
import { createOpenCodeEventConverter } from '../block-converter.js';
import { reduceSessionEvent } from '../../session-state/reducer.js';
import { parseOpenCodeTranscriptFile } from '../transcript-parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DATA_DIR = __dirname;
const OUTPUT_DIR = join(TEST_DATA_DIR, 'output');

// Main session ID from test data
const MAIN_SESSION_ID = 'ses_019b38d16719_9fwj8902kdq';

/**
 * Build state by processing raw OpenCode events through converter + reducer.
 * This simulates the streaming path.
 */
function buildStateFromStreaming(): SessionConversationState {
  const content = readFileSync(join(TEST_DATA_DIR, 'raw-opencode-messages.jsonl'), 'utf-8');
  const lines = content.trim().split('\n').filter((line) => line.trim());

  let state = createInitialConversationState();
  const converter = createOpenCodeEventConverter(MAIN_SESSION_ID);

  const allSessionEvents: AnySessionEvent[] = [];
  const rawEventsConverted: Event[] = [];

  const linesToProcess = 25;
  let lineCount = 0;

  for (const line of lines) {
    const event = JSON.parse(line) as Event;
    lineCount++;
    if (lineCount > linesToProcess) {
      break;
    }

    const sessionEvents = converter.parseEvent(event);
    allSessionEvents.push(...sessionEvents);

    if (sessionEvents.length > 0) {
      rawEventsConverted.push(event);
    }

    for (const sessionEvent of sessionEvents) {
      state = reduceSessionEvent(state, sessionEvent);
    }
  }

  // Write debug output files
  writeFileSync(
    join(OUTPUT_DIR, 'streamed-session-events.jsonl'),
    allSessionEvents.map(event => JSON.stringify(event)).join('\n')
  );
  writeFileSync(
    join(OUTPUT_DIR, 'raw-events-converted.jsonl'),
    rawEventsConverted.map(ev => JSON.stringify(ev)).join('\n')
  );

  return state;
}

/**
 * Build state by loading from transcript.
 * This simulates loading a saved session.
 */
function buildStateFromTranscript(): SessionConversationState {
  const content = readFileSync(join(TEST_DATA_DIR, 'main-opencode-transcript.json'), 'utf-8');
  return parseOpenCodeTranscriptFile(content);
}

/**
 * Get block type counts for debugging
 */
function getBlockTypeCounts(blocks: ConversationBlock[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const block of blocks) {
    counts[block.type] = (counts[block.type] || 0) + 1;
  }
  return counts;
}

/**
 * Get text content from blocks for comparison
 */
function getTextContent(blocks: ConversationBlock[]): string[] {
  return blocks
    .filter((b) => b.type === 'assistant_text')
    .map((b) => (b as any).content)
    .filter(Boolean);
}

describe('OpenCode converter parity', () => {
  let streamingState: SessionConversationState;
  let transcriptState: SessionConversationState;

  beforeAll(() => {
    streamingState = buildStateFromStreaming();
    transcriptState = buildStateFromTranscript();

    // Write output files for inspection
    if (!existsSync(OUTPUT_DIR)) {
      mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Custom serializer for Map objects
    const replacer = (key: string, value: any) => {
      if (value instanceof Map) {
        return Object.fromEntries(value);
      }
      return value;
    };

    writeFileSync(
      join(OUTPUT_DIR, 'streaming-state.json'),
      JSON.stringify(streamingState, replacer, 2)
    );
    writeFileSync(
      join(OUTPUT_DIR, 'transcript-state.json'),
      JSON.stringify(transcriptState, replacer, 2)
    );
    writeFileSync(
      join(OUTPUT_DIR, 'comparison.json'),
      JSON.stringify({
        streaming: {
          mainBlockCount: streamingState.blocks.length,
          mainBlockTypes: getBlockTypeCounts(streamingState.blocks),
          mainBlockList: streamingState.blocks.map(b => ({ id: b.id, type: b.type })),
          subagentCount: streamingState.subagents.length,
          subagents: streamingState.subagents.map(s => ({
            id: s.id,
            blockCount: s.blocks.length,
            blockTypes: getBlockTypeCounts(s.blocks),
          })),
        },
        transcript: {
          mainBlockCount: transcriptState.blocks.length,
          mainBlockTypes: getBlockTypeCounts(transcriptState.blocks),
          mainBlockList: transcriptState.blocks.map(b => ({ id: b.id, type: b.type })),
          subagentCount: transcriptState.subagents.length,
          subagents: transcriptState.subagents.map(s => ({
            id: s.id,
            blockCount: s.blocks.length,
            blockTypes: getBlockTypeCounts(s.blocks),
          })),
        },
      }, null, 2)
    );
  });

  describe('Basic state validation', () => {
    it('streaming produces blocks', () => {
      expect(streamingState.blocks.length).toBeGreaterThan(0);
    });

    it('transcript produces blocks', () => {
      expect(transcriptState.blocks.length).toBeGreaterThan(0);
    });
  });

  describe('Main conversation parity', () => {
    it('produces same main block count', () => {
      expect(streamingState.blocks.length).toBe(transcriptState.blocks.length);
    });

    it('produces same block types in order', () => {
      const streamingTypes = streamingState.blocks.map((b) => b.type);
      const transcriptTypes = transcriptState.blocks.map((b) => b.type);
      expect(streamingTypes).toEqual(transcriptTypes);
    });

    it('block type counts match', () => {
      const streamingCounts = getBlockTypeCounts(streamingState.blocks);
      const transcriptCounts = getBlockTypeCounts(transcriptState.blocks);
      expect(streamingCounts).toEqual(transcriptCounts);
    });

    it('text block content matches', () => {
      const streamingText = getTextContent(streamingState.blocks);
      const transcriptText = getTextContent(transcriptState.blocks);
      expect(streamingText.length).toBe(transcriptText.length);
      for (let i = 0; i < transcriptText.length; i++) {
        expect(streamingText[i]).toBe(transcriptText[i]);
      }
    });
  });

  describe('Subagent parity', () => {
    it('produces same subagent count', () => {
      expect(streamingState.subagents.length).toBe(transcriptState.subagents.length);
    });

    it('subagent blocks have matching counts', () => {
      for (let i = 0; i < transcriptState.subagents.length; i++) {
        const streaming = streamingState.subagents[i];
        const transcript = transcriptState.subagents[i];

        if (!streaming || !transcript) {
          expect(streaming).toBeDefined();
          expect(transcript).toBeDefined();
          continue;
        }

        expect(streaming.blocks.length).toBe(transcript.blocks.length);
      }
    });

    it('subagent blocks have matching types', () => {
      for (let i = 0; i < transcriptState.subagents.length; i++) {
        const streaming = streamingState.subagents[i];
        const transcript = transcriptState.subagents[i];

        if (!streaming || !transcript) continue;

        const streamingTypes = streaming.blocks.map((b) => b.type);
        const transcriptTypes = transcript.blocks.map((b) => b.type);
        expect(streamingTypes).toEqual(transcriptTypes);
      }
    });
  });

  describe('Diagnostics', () => {
    it('logs state comparison for debugging', () => {
      console.log('\n=== STREAMING STATE ===');
      console.log('Main blocks:', streamingState.blocks.length);
      console.log('Block types:', getBlockTypeCounts(streamingState.blocks));
      console.log('Subagents:', streamingState.subagents.length);
      if (streamingState.subagents.length > 0) {
        streamingState.subagents.forEach((s, i) => {
          console.log(`  Subagent ${i}: ${s.id} - ${s.blocks.length} blocks`);
        });
      }

      console.log('\n=== TRANSCRIPT STATE ===');
      console.log('Main blocks:', transcriptState.blocks.length);
      console.log('Block types:', getBlockTypeCounts(transcriptState.blocks));
      console.log('Subagents:', transcriptState.subagents.length);
      if (transcriptState.subagents.length > 0) {
        transcriptState.subagents.forEach((s, i) => {
          console.log(`  Subagent ${i}: ${s.id} - ${s.blocks.length} blocks`);
        });
      }

      console.log('\nOutput files written to:', OUTPUT_DIR);
    });
  });
});
