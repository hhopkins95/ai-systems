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
 * CLI Scripts:
 * - execute-query: Unified query executor for Claude SDK and OpenCode
 * - setup-session: Session setup (entities, MCP config, transcripts)
 */

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
