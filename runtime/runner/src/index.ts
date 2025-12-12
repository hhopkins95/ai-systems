/**
 * @hhopkins/agent-runner (agent-runner)
 *
 * Execution scripts for running agent queries inside sandboxes.
 *
 * This package contains CLI scripts that are bundled and deployed to sandboxes
 * (Modal, Docker, etc.) or run locally to execute queries against agent SDKs.
 *
 * The scripts output StreamEvents as JSONL to stdout, which is consumed by
 * the ExecutionEnvironment in the agent-runtime server.
 *
 * CLI Commands (unified runner):
 * - runner load-agent-profile: Load agent profile into environment
 * - runner load-session-transcript: Load session transcript
 * - runner execute-query: Execute query against Claude SDK or OpenCode
 * - runner read-session-transcript: Read current session transcript
 *
 * Core functions can be imported directly for testing:
 * - executeClaudeQuery, executeOpencodeQuery
 * - loadAgentProfile, loadSessionTranscript, readSessionTranscript
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Path to the bundled runner CLI script.
 * Use this to copy the runner into execution environments.
 */
export const runnerBundlePath = join(__dirname, 'runner.js');

/**
 * Content of the bundled runner CLI script.
 * Use this to write the runner directly into execution environments.
 */
export const getRunnerBundleContent = (): string => {
  return readFileSync(runnerBundlePath, 'utf-8');
};

// Core functions - can be called directly for testing
export * from './core/index.js';

// Client utilities
export * from './clients/index.js';

// Types
export type {
  // Core types
  AgentArchitecture,
  ExecutionContext,
  ExecutionOptions,
  ExecutionResult,
  // CLI types
  ExecuteQueryArgs,
  SetupSessionInput,
  SetupSessionResult,
  McpServerConfig,
  ClaudeMcpJsonConfig,
} from './types.js';
