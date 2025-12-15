/**
 * Types for execution scripts
 *
 * These types define the interfaces for execution adapters that run inside
 * Modal sandboxes. Each adapter is responsible for executing queries against
 * a specific agent SDK and streaming normalized output.
 */

import type { AgentArchitecture, ConversationBlock } from '@ai-systems/shared-types';

// Re-export AgentArchitecture for convenience
export type { AgentArchitecture };

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
  /** Base workspace path */
  baseWorkspacePath: string;
  /** Model to use (format: provider/model for opencode) */
  model?: string;
  /** JSON array of allowed tools (Claude SDK only) */
  tools?: string[];
  /** JSON object of MCP server configs */
  mcpServers?: Record<string, unknown>;
}

