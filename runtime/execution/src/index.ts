/**
 * @hhopkins/agent-execution
 *
 * Execution scripts for running agent queries inside Modal sandboxes.
 *
 * This package contains CLI scripts that are copied to Modal sandboxes
 * and executed to run queries against various agent SDKs (Claude SDK, OpenCode).
 *
 * The scripts stream JSONL output to stdout, which is consumed by the
 * agent-runtime server.
 *
 * Scripts:
 * - claude-sdk.ts: Executes Anthropic Agent SDK queries
 * - opencode.ts: Executes OpenCode SDK queries
 */

export type {
  AgentArchitecture,
  ExecutionContext,
  ExecutionOptions,
  ExecutionResult,
} from './types.js';
