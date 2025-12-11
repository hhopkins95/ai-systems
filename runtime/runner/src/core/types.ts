/**
 * Types for core functions.
 */

import type { AgentArchitecture } from '@ai-systems/shared-types';

/**
 * Input for execute-query core functions.
 */
export interface ExecuteQueryInput {
  /** The prompt/query to send to the agent */
  prompt: string;
  /** Session ID for tracking */
  sessionId: string;
  /** Agent architecture to use */
  architecture: AgentArchitecture;
  /** Working directory */
  cwd?: string;
  /** Model to use (format: provider/model for opencode) */
  model?: string;
  /** Allowed tools (Claude SDK only) */
  tools?: string[];
  /** MCP server configs */
  mcpServers?: Record<string, unknown>;
}

/**
 * User message for streaming input.
 */
export interface UserMessage {
  role: 'user';
  content: string;
}

/**
 * Log event emitted during execution.
 */
export interface LogEvent {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data?: Record<string, unknown>;
}
