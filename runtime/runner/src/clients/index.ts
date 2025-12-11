/**
 * SDK client management utilities.
 */

export {
  createMessageChannel,
  emptyAsyncIterable,
  type MessageChannel,
} from './channel.js';

export {
  findClaudeExecutable,
  resetClaudeExecutable,
} from './claude.js';

export {
  getOpencodeConnection,
  resetOpencodeConnection,
  closeOpencodeServer,
  type OpencodeConnection,
  type OpencodeClientOptions,
} from './opencode.js';
