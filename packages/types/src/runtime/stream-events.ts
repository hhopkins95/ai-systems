/**
 * Stream Event Types
 *
 * Events emitted during real-time conversation streaming.
 * Supports both text deltas (character-by-character) and status updates
 * (metadata changes like tool execution status).
 *
 * These events allow UIs to:
 * - Show typing animations for assistant text
 * - Display thinking in real-time
 * - Update tool/subagent execution status
 * - Track progress of long-running operations
 * 
 * 
 * Also includes execution-environment level events -- logs, errors, status updates, etc. 
 */

import type { ConversationBlock } from './blocks.js';

// ============================================================================
// Stream Event Types
// ============================================================================

/**
 * Block Start Event
 *
 * Emitted when a new block begins. The block may be incomplete
 * (e.g., AssistantTextBlock with empty content that will be filled via deltas).
 *
 * Use cases:
 * - AssistantTextBlock starts (content: "")
 * - ThinkingBlock starts (content: "")
 * - ToolUseBlock created (may have partial input)
 */
export interface BlockStartEvent {
  type: 'block_start';

  /**
   * The block that's starting (may be partial/incomplete)
   */
  block: ConversationBlock;

  /**
   * Which conversation thread this belongs to
   */
  conversationId: 'main' | string; // 'main' or subagentId
}

/**
 * Text Delta Event
 *
 * Emitted when text content is streaming in character-by-character.
 * Only applies to blocks with text content (AssistantText, Thinking).
 *
 * The UI should append this delta to the existing block content.
 */
export interface TextDeltaEvent {
  type: 'text_delta';

  /**
   * ID of the block being updated
   */
  blockId: string;

  /**
   * Text to append to the block's content
   */
  delta: string;

  /**
   * Which conversation thread this belongs to
   */
  conversationId: 'main' | string;
}

/**
 * Block Update Event
 *
 * Emitted when a block's metadata/status changes (not text content).
 *
 * Use cases:
 * - ToolUseBlock status: pending -> running -> success
 * - SubagentBlock status: pending -> running -> success
 * - SubagentBlock output populated when complete
 * - Model information added to AssistantTextBlock
 */
export interface BlockUpdateEvent {
  type: 'block_update';

  /**
   * ID of the block being updated
   */
  blockId: string;

  /**
   * Partial updates to apply to the block
   * Only non-content fields should be updated here
   */
  updates: Partial<ConversationBlock>;

  /**
   * Which conversation thread this belongs to
   */
  conversationId: 'main' | string;
}

/**
 * Block Complete Event
 *
 * Emitted when a block is finalized and complete.
 *
 * After this event:
 * - No more deltas will be sent for this block
 * - No more updates will be sent for this block
 * - The block is in its final state
 *
 * Use cases:
 * - AssistantTextBlock finished streaming
 * - ThinkingBlock finished streaming
 * - ToolResultBlock received (arrives complete)
 * - UserMessageBlock received (arrives complete)
 * - SystemBlock received (arrives complete)
 */
export interface BlockCompleteEvent {
  type: 'block_complete';

  /**
   * ID of the block that's now complete
   */
  blockId: string;

  /**
   * The complete, final block
   */
  block: ConversationBlock;

  /**
   * Which conversation thread this belongs to
   */
  conversationId: 'main' | string;
}

/**
 * Metadata Update Event
 *
 * Emitted when session-level metadata changes.
 * Not related to a specific block.
 *
 * Use cases:
 * - Token usage updated
 * - Cost updated
 * - Model information
 */
export interface MetadataUpdateEvent {
  type: 'metadata_update';

  /**
   * Metadata updates
   */
  metadata: {
    /**
     * Token usage for the current response
     */
    usage?: {
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
      thinkingTokens?: number;
      totalTokens: number;
    };

    /**
     * Cost in USD
     */
    costUSD?: number;

    /**
     * Model being used
     */
    model?: string;

    /**
     * Other arbitrary metadata
     */
    [key: string]: unknown;
  };

  /**
   * Which conversation thread this belongs to
   */
  conversationId: 'main' | string;
}

// ============================================================================
// Execution Environment Events
// ============================================================================

/**
 * Execution environment status values.
 * Represents the lifecycle state of the execution environment container.
 */
export type ExecutionEnvironmentStatus =
  | 'inactive'      // No environment exists
  | 'starting'      // Being created/initialized
  | 'ready'         // Healthy and running
  | 'error'         // Encountered an error
  | 'terminated';   // Shut down (timeout, explicit, or crash)

/**
 * Status Event
 *
 * Emitted when the execution environment state changes.
 * This is the authoritative signal for EE lifecycle transitions.
 *
 * Use cases:
 * - Environment starting up
 * - Environment ready to accept queries
 * - Environment encountered an error
 * - Environment terminated
 */
export interface StatusEvent {
  type: 'status';

  /**
   * Current execution environment status
   */
  status: ExecutionEnvironmentStatus;

  /**
   * Human-readable status message for UI display
   */
  message?: string;
}

/**
 * Log Event
 *
 * Informational log message from the runner or execution environment.
 * These are operational logs, not conversation content.
 *
 * Use cases:
 * - Debug information during query execution
 * - Progress updates for long operations
 * - Diagnostic information
 */
export interface LogEvent {
  type: 'log';

  /**
   * Log level for filtering/display
   */
  level?: 'debug' | 'info' | 'warn' | 'error';

  /**
   * Log message
   */
  message: string;

  /**
   * Additional structured data
   */
  data?: Record<string, unknown>;
}

/**
 * Error Event
 *
 * Error that occurred during runner/execution environment operation.
 * These are operational errors, not conversation-level errors.
 *
 * Use cases:
 * - Runner script execution failure
 * - SDK initialization error
 * - File system errors in sandbox
 */
export interface ErrorEvent {
  type: 'error';

  /**
   * Error message
   */
  message: string;

  /**
   * Error code for programmatic handling
   */
  code?: string;

  /**
   * Additional error context
   */
  data?: Record<string, unknown>;
}

/**
 * Script Output Event
 *
 * Final result from a non-streaming runner script command.
 * Emitted as the last line of stdout for commands that produce a result.
 *
 * Use cases:
 * - load-agent-profile completion status
 * - load-session-transcript completion status
 * - read-session-transcript returning transcript data
 */
export interface ScriptOutput<T = unknown> {
  type: 'script_output';

  /**
   * Whether the script completed successfully
   */
  success: boolean;

  /**
   * Result data (type varies by command)
   */
  data?: T;

  /**
   * Error message if success is false
   */
  error?: string;
}

// ============================================================================
// Union Type
// ============================================================================

/**
 * All possible stream event types
 *
 * Divided into two categories:
 * - Conversation events: Block-related events for the chat UI
 * - Execution events: Operational events for status/logs/errors
 */
export type StreamEvent =
  // Conversation events
  | BlockStartEvent
  | TextDeltaEvent
  | BlockUpdateEvent
  | BlockCompleteEvent
  | MetadataUpdateEvent
  // Execution environment events
  | StatusEvent
  | LogEvent
  | ErrorEvent
  | ScriptOutput;
// ============================================================================
// Type Guards
// ============================================================================

export function isBlockStartEvent(event: StreamEvent): event is BlockStartEvent {
  return event.type === 'block_start';
}

export function isTextDeltaEvent(event: StreamEvent): event is TextDeltaEvent {
  return event.type === 'text_delta';
}

export function isBlockUpdateEvent(event: StreamEvent): event is BlockUpdateEvent {
  return event.type === 'block_update';
}

export function isBlockCompleteEvent(event: StreamEvent): event is BlockCompleteEvent {
  return event.type === 'block_complete';
}

export function isMetadataUpdateEvent(event: StreamEvent): event is MetadataUpdateEvent {
  return event.type === 'metadata_update';
}

export function isStatusEvent(event: StreamEvent): event is StatusEvent {
  return event.type === 'status';
}

export function isLogEvent(event: StreamEvent): event is LogEvent {
  return event.type === 'log';
}

export function isErrorEvent(event: StreamEvent): event is ErrorEvent {
  return event.type === 'error';
}

export function isScriptOutput(event: StreamEvent): event is ScriptOutput {
  return event.type === 'script_output';
}
