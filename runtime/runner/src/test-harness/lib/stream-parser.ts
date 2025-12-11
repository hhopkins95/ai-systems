/**
 * JSONL stream parser - parses runner output and builds summaries
 */

import type { StreamEvent, ConversationBlock } from '@ai-systems/shared-types';
import type { ParsedStream, StreamSummary } from '../types.js';

/**
 * Parse JSONL output from execute-query into structured data
 *
 * @param stdout - Raw stdout content (JSONL format)
 * @returns Parsed stream with events, errors, and summary
 */
export function parseJsonlStream(stdout: string): ParsedStream {
  const events: StreamEvent[] = [];
  const errors: Error[] = [];
  const summary: StreamSummary = {
    totalEvents: 0,
    byType: {},
    textContent: [],
    toolCalls: [],
    hasError: false,
  };

  const lines = stdout.split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;

    try {
      const event = JSON.parse(line) as StreamEvent;
      events.push(event);
      summary.totalEvents++;

      // Count by type
      summary.byType[event.type] = (summary.byType[event.type] || 0) + 1;

      // Extract content based on event type
      processEvent(event, summary);
    } catch (e) {
      errors.push(new Error(`Failed to parse line: ${line.substring(0, 100)}`));
    }
  }

  return { events, errors, summary };
}

/**
 * Process a single event and update summary statistics
 */
function processEvent(event: StreamEvent, summary: StreamSummary): void {
  // Extract text content from assistant text blocks
  if (event.type === 'block_complete' && event.block) {
    const block = event.block as ConversationBlock;

    if (block.type === 'assistant_text' && 'content' in block) {
      summary.textContent.push((block as { content: string }).content);
    }

    // Track tool calls
    if (block.type === 'tool_use' && 'name' in block) {
      summary.toolCalls.push((block as { name: string }).name);
    }

    // Check for errors
    if (block.type === 'system') {
      const sysBlock = block as { subtype?: string };
      if (sysBlock.subtype === 'error') {
        summary.hasError = true;
      }
    }
  }
}

/**
 * Format a stream summary for human-readable output
 */
export function formatSummary(parsed: ParsedStream, duration: number): string {
  const { summary, errors } = parsed;
  const lines: string[] = [];

  lines.push('');
  lines.push('=== Execution Summary ===');
  lines.push(`Duration: ${duration}ms`);
  lines.push(`Total events: ${summary.totalEvents}`);

  if (Object.keys(summary.byType).length > 0) {
    lines.push('');
    lines.push('Events by type:');
    for (const [type, count] of Object.entries(summary.byType).sort()) {
      lines.push(`  ${type}: ${count}`);
    }
  }

  if (summary.textContent.length > 0) {
    lines.push('');
    lines.push('=== Response Text ===');
    lines.push(summary.textContent.join(''));
  }

  if (summary.toolCalls.length > 0) {
    lines.push('');
    lines.push('=== Tool Calls ===');
    for (const tool of summary.toolCalls) {
      lines.push(`  - ${tool}`);
    }
  }

  if (errors.length > 0) {
    lines.push('');
    lines.push('=== Parse Errors ===');
    for (const err of errors) {
      lines.push(`  ${err.message}`);
    }
  }

  if (summary.hasError) {
    lines.push('');
    lines.push('⚠️  Execution contained errors');
  }

  return lines.join('\n');
}
