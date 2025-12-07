/**
 * Types for execution scripts
 *
 * These types define the interfaces for execution adapters that run inside
 * Modal sandboxes. Each adapter is responsible for executing queries against
 * a specific agent SDK and streaming normalized output.
 */

import type { ConversationBlock, StreamEvent } from '@ai-systems/shared-types';
import type { WriteEntitiesOptions } from '@hhopkins/claude-entity-manager';

/**
 * Supported agent architectures
 */
export type AgentArchitecture = 'claude-sdk' | 'opencode' | 'gemini';

/**
 * Context provided to execution scripts by the sandbox
 */
export interface ExecutionContext {
  workspaceDir: string;
  homeDir: string;
  appDir: string;
}

/**
 * Options for executing a query
 */
export interface ExecutionOptions {
  sessionId: string;
  cwd?: string;
  tools?: string[];
  mcpServers?: Record<string, unknown>;
  model?: string;
}

/**
 * Result of executing a query (for non-streaming use cases)
 */
export interface ExecutionResult {
  blocks: ConversationBlock[];
  metadata?: {
    usage?: {
      inputTokens: number;
      outputTokens: number;
    };
    costUSD?: number;
    durationMs?: number;
  };
}

// =============================================================================
// CLI Script Types
// =============================================================================

/**
 * CLI arguments for execute-query script
 */
export interface ExecuteQueryArgs {
  /** The prompt/query to send to the agent */
  prompt: string;
  /** Session ID for tracking */
  sessionId: string;
  /** Agent architecture to use */
  architecture: AgentArchitecture;
  /** Working directory (default: /workspace) */
  cwd?: string;
  /** Model to use (format: provider/model for opencode) */
  model?: string;
  /** JSON array of allowed tools (Claude SDK only) */
  tools?: string[];
  /** JSON object of MCP server configs */
  mcpServers?: Record<string, unknown>;
}

/**
 * MCP server configuration
 */
export interface McpServerConfig {
  /** Command to run the server */
  command: string;
  /** Command arguments */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
}

/**
 * Input for setup-session script (passed via stdin as JSON)
 */
export interface SetupSessionInput {
  /** Working directory (workspace path) where .claude/ will be created */
  projectDir: string;

  /** Individual entities to write */
  entities?: WriteEntitiesOptions;

  /** Session transcript content (if resuming a session) */
  sessionTranscript?: string;

  /** Session ID (required if sessionTranscript is provided) */
  sessionId?: string;

  /** MCP server configurations */
  mcpServers?: Record<string, McpServerConfig>;

  /** Target architecture (affects config file format) */
  architecture: AgentArchitecture;
}

/**
 * Output from setup-session script
 */
export interface SetupSessionResult {
  /** Whether setup completed successfully */
  success: boolean;
  /** List of file paths that were written */
  filesWritten: string[];
  /** Error messages if success is false */
  errors?: string[];
}

/**
 * Claude SDK .mcp.json file format
 */
export interface ClaudeMcpJsonConfig {
  mcpServers: Record<string, {
    type: 'stdio';
    command: string;
    args: string[];
    env?: Record<string, string>;
  }>;
}
