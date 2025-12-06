/**
 * Types for execution scripts
 *
 * These types define the interfaces for execution adapters that run inside
 * Modal sandboxes. Each adapter is responsible for executing queries against
 * a specific agent SDK and streaming normalized output.
 */

import type { ConversationBlock, StreamEvent } from '@ai-systems/shared-types';

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
