/**
 * Type definitions for Agent Service React Client
 *
 * This package re-exports shared types from @hhopkins/agent-server
 * and defines client-specific types for REST API and configuration.
 */

import type { AgentArchitecture, AgentArchitectureSessionOptions, SessionRuntimeState } from '@ai-systems/shared-types';


// ============================================================================
// Re-export Shared Types from Backend Runtime
// ============================================================================

export type {
  // Session types
  WorkspaceFile,
  RuntimeSessionData,
  SessionRuntimeState,
  SessionListItem,
  ExecutionEnvironmentStatus,
  ExecutionEnvironmentState,
  ExecutionEnvironmentError,
  ActiveQueryState,

  // WebSocket event types
  ServerToClientEvents,
  ClientToServerEvents,
} from '@hhopkins/agent-server/types';

// Re-export block/content/architecture types from shared types
export type {
  // Block types
  ConversationBlock,
  UserMessageBlock,
  AssistantTextBlock,
  ToolUseBlock,
  ToolResultBlock,
  ThinkingBlock,
  SystemBlock,
  SubagentBlock,
  BaseBlock,
  ErrorBlock,
  AgentArchitecture,

  // Content types
  TextContent,
  ImageContent,
  ContentPart,
  MessageContent,

  // Status types
  ToolExecutionStatus,
  SubagentStatus,

  // Architecture session options
  AgentArchitectureSessionOptions,

  // Session state types (for shared reducer pattern)
  SessionConversationState,
  SubagentState,
  AnySessionEvent,
} from '@ai-systems/shared-types';



// ============================================================================
// Client-Specific Types
// ============================================================================

/**
 * Token usage tracking for session cost estimation
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  thinkingTokens?: number;
  totalTokens: number;
}

/**
 * Session metadata including usage and cost information
 */
export interface SessionMetadata {
  usage?: TokenUsage;
  costUSD?: number;
  model?: string;
  [key: string]: unknown;
}

// ============================================================================
// REST API Request/Response Types
// ============================================================================

export interface CreateSessionRequest {
  agentProfileRef: string;
  architecture: AgentArchitecture;
  sessionOptions?: AgentArchitectureSessionOptions;
}

export interface CreateSessionResponse {
  sessionId: string;
  runtime: SessionRuntimeState;
  createdAt: number;
  sessionOptions?: AgentArchitectureSessionOptions;
}

export interface UpdateSessionOptionsRequest {
  sessionOptions: AgentArchitectureSessionOptions;
}

export interface UpdateSessionOptionsResponse {
  success: boolean;
  sessionId: string;
  sessionOptions: AgentArchitectureSessionOptions;
}

export interface SendMessageRequest {
  content: string;
}

export interface SendMessageResponse {
  success: boolean;
  sessionId: string;
}

export interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
}

// ============================================================================
// Client Configuration
// ============================================================================

export interface AgentServiceConfig {
  apiUrl: string;
  wsUrl: string;
  apiKey: string;
  debug?: boolean;
}
