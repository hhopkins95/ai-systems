/**
 * Test harness exports for programmatic use
 */

export { runRunner, getRunnerPath } from './lib/process-runner.js';
export { createWorkspace, ensureDir } from './lib/workspace.js';
export { parseJsonlStream, formatSummary } from './lib/stream-parser.js';
export { resolveInput, mergeInput } from './lib/input-resolver.js';

export type {
  RunnerCommand,
  RunnerOptions,
  RunnerResult,
  WorkspaceOptions,
  Workspace,
  ParsedStream,
  StreamSummary,
  OutputFormat,
} from './types.js';
