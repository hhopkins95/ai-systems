/**
 * Tests for Claude SDK converter parity
 *
 * Verifies that building state via streaming (raw SDK messages)
 * produces the same result as loading from transcript.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { SessionConversationState, AnySessionEvent } from '@ai-systems/shared-types';
import { createInitialConversationState } from '@ai-systems/shared-types';
import { sdkMessageToEvents } from './block-converter.js';
import { reduceSessionEvent } from '../session-state/reducer.js';
import { parseCombinedClaudeTranscript } from './transcript-parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DATA_DIR = join(__dirname, '../test/claude');
const OUTPUT_DIR = join(TEST_DATA_DIR, 'output');

// Subagent info from test data
const SUBAGENT_TOOL_USE_ID = 'toolu_01H79rxPSUkpfuuZFosbzSsv';
const SUBAGENT_AGENT_ID = 'a9b844f';

interface RawSDKMessage extends SDKMessage {
  parent_tool_use_id?: string | null;
}

/**
 * Build state by processing raw SDK messages through events + reducer.
 * This simulates the streaming path.
 */
function buildStateFromStreaming(): SessionConversationState {
  const content = readFileSync(join(TEST_DATA_DIR, 'raw-sdk-messages.jsonl'), 'utf-8');
  const lines = content.trim().split('\n').filter((line) => line.trim());

  let state = createInitialConversationState();

  for (const line of lines) {
    const msg = JSON.parse(line) as RawSDKMessage;

    // Convert SDK message to events
    const events = sdkMessageToEvents(msg);

    // Set conversationId based on parent_tool_use_id
    const conversationId = msg.parent_tool_use_id ?? 'main';

    for (const event of events) {
      if (event.context) {
        event.context.conversationId = conversationId;
      }
      state = reduceSessionEvent(state, event);
    }
  }

  return state;
}

/**
 * Build state by loading from combined transcript.
 * This simulates loading a saved session.
 */
function buildStateFromTranscript(): SessionConversationState {
  const mainContent = readFileSync(join(TEST_DATA_DIR, 'main-transcript.jsonl'), 'utf-8');
  const subagentContent = readFileSync(join(TEST_DATA_DIR, 'subagent-transcript.jsonl'), 'utf-8');

  // Construct combined transcript format
  const combined = {
    main: mainContent,
    subagents: [
      {
        id: SUBAGENT_AGENT_ID,
        transcript: subagentContent,
      },
    ],
  };

  return parseCombinedClaudeTranscript(JSON.stringify(combined));
}

/**
 * Remove streaming state for comparison since transcript loading won't have it
 */
function stripStreamingState(state: SessionConversationState): Omit<SessionConversationState, 'streaming'> {
  const { streaming, ...rest } = state;
  return {
    ...rest,
    subagents: rest.subagents.map((s) => {
      const { streaming: subStreaming, ...subRest } = s;
      return subRest;
    }),
  };
}

describe('Claude SDK converter parity', () => {
  let streamingState: SessionConversationState;
  let transcriptState: SessionConversationState;

  beforeAll(() => {
    streamingState = buildStateFromStreaming();
    transcriptState = buildStateFromTranscript();

    // Write output files for inspection
    if (!existsSync(OUTPUT_DIR)) {
      mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    writeFileSync(
      join(OUTPUT_DIR, 'streaming-state.json'),
      JSON.stringify(streamingState, null, 2)
    );
    writeFileSync(
      join(OUTPUT_DIR, 'transcript-state.json'),
      JSON.stringify(transcriptState, null, 2)
    );
  });

  it('streaming produces blocks', () => {
    expect(streamingState.blocks.length).toBeGreaterThan(0);
  });

  it('transcript produces blocks', () => {
    expect(transcriptState.blocks.length).toBeGreaterThan(0);
  });

  it('streaming and transcript produce same main block count', () => {
    expect(streamingState.blocks.length).toBe(transcriptState.blocks.length);
  });

  it('streaming and transcript produce same subagent count', () => {
    expect(streamingState.subagents.length).toBe(transcriptState.subagents.length);
  });

  it('main blocks have matching types', () => {
    const streamingTypes = streamingState.blocks.map((b) => b.type);
    const transcriptTypes = transcriptState.blocks.map((b) => b.type);
    expect(streamingTypes).toEqual(transcriptTypes);
  });

  it('subagent blocks have matching types', () => {
    if (streamingState.subagents.length === 0) {
      expect(transcriptState.subagents.length).toBe(0);
      return;
    }

    const streamingSubagent = streamingState.subagents[0];
    const transcriptSubagent = transcriptState.subagents[0];

    expect(streamingSubagent).toBeDefined();
    expect(transcriptSubagent).toBeDefined();

    const streamingTypes = streamingSubagent!.blocks.map((b) => b.type);
    const transcriptTypes = transcriptSubagent!.blocks.map((b) => b.type);
    expect(streamingTypes).toEqual(transcriptTypes);
  });

  it('text block content matches', () => {
    const streamingText = streamingState.blocks
      .filter((b) => b.type === 'text')
      .map((b) => (b as any).content);
    const transcriptText = transcriptState.blocks
      .filter((b) => b.type === 'text')
      .map((b) => (b as any).content);

    expect(streamingText).toEqual(transcriptText);
  });
});
