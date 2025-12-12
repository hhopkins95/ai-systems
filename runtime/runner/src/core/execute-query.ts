/**
 * Execute query dispatcher.
 *
 * Routes queries to the appropriate SDK implementation based on architecture.
 */

import type { StreamEvent, UserMessageBlock } from '@ai-systems/shared-types';
import { emptyAsyncIterable } from '../clients/channel.js';
import { executeClaudeQuery } from './execute-claude-query.js';
import { executeOpencodeQuery } from './execute-opencode-query.js';
import type { ExecuteQueryArgs } from '../types.js';

/**
 * Execute a query using the specified architecture.
 *
 * This is the main entry point for query execution. It dispatches to the
 * appropriate SDK implementation based on the architecture field in the input.
 *
 * @param input - Query parameters including architecture, prompt, session ID, etc.
 * @param messages - Optional async iterable of follow-up messages for streaming input
 * @yields StreamEvent objects from the underlying SDK
 *
 * @example
 * ```typescript
 * import { executeQuery } from '@hhopkins/agent-runner';
 *
 * const input = {
 *   prompt: 'What is 2 + 2?',
 *   architecture: 'claude-sdk',
 *   sessionId: 'my-session',
 *   cwd: '/workspace'
 * };
 *
 * for await (const event of executeQuery(input)) {
 *   console.log(event);
 * }
 * ```
 */
export async function* executeQuery(
  input: ExecuteQueryArgs,
  messages: AsyncIterable<UserMessageBlock> = emptyAsyncIterable()
): AsyncGenerator<StreamEvent> {
  if (input.architecture === 'claude-sdk') {
    yield* executeClaudeQuery(input, messages);
  } else if (input.architecture === 'opencode') {
    yield* executeOpencodeQuery(input, messages);
  } else {
    throw new Error(`Unknown architecture: ${input.architecture}`);
  }
}
