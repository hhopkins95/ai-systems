import { AgentArchitecture, AgentArchitectureSessionOptions } from "./architecture.js";
import type { ConversationBlock } from "./blocks.js";

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
 * A file in the workspace during the session
 */
export type WorkspaceFile = {
    path: string,
    content: string | undefined
}

// =============================================================================
// Persistence Layer Types (stored in database, no runtime state)
// =============================================================================

/**
 * Minimal session data for persistence layer.
 * Used for listing sessions and basic session info.
 * Does NOT include status - that's derived from runtime state.
 */
export interface PersistedSessionListData {
    /**
     * The id that comes from the agent app (ie Claude Agent SDK, Gemini CLI, etc...) -- not the id from external app that is using this server
     */
    sessionId: string,
    type: AgentArchitecture,
    /**
     * Runtime / execution options (like model selection, etc...)
     * 
     * Depends on the architecture type
     */
    sessionOptions? : AgentArchitectureSessionOptions,
    agentProfileReference: string, // The id / name of the agent profile this session is using
    name?: string,
    lastActivity?: number,
    createdAt?: number,
    metadata?: Record<string, unknown>,
}

/**
 * Full session data for persistence layer.
 * Includes raw transcripts and workspace files.
 * Does NOT include parsed blocks - those are computed at runtime.
 */
export interface PersistedSessionData extends PersistedSessionListData {

    /**
     * Stringified raw transcript blob from the agent application. Either the jsonl file for claude-agent-sdk or the json file for gemini-cli.
     */
    rawTranscript?: string,
    /**
     * Stringified raw transcript blob for each subagent. Either the jsonl file for claude-agent-sdk or the json file for gemini-cli.
     */
    subagents?: {
        id: string,
        rawTranscript?: string,
    }[],

    /**
     * The workspace files used / created during the session.
     */
    workspaceFiles: WorkspaceFile[]
}

// =============================================================================
// Runtime Layer Types (derived state, never persisted)
// =============================================================================

/**
 * Error information for the execution environment
 */
export interface ExecutionEnvironmentError {
    /** Error message */
    message: string;
    /** Error code for programmatic handling */
    code?: string;
    /** When the error occurred */
    timestamp: number;
}

/**
 * Execution environment state.
 * Represents the container that runs agent queries.
 */
export interface ExecutionEnvironmentState {
    /** Environment ID - available after 'starting' phase */
    id?: string;
    /** Current lifecycle status */
    status: ExecutionEnvironmentStatus;
    /** Human-readable status message for UI display */
    statusMessage?: string;
    /** Last health check timestamp */
    lastHealthCheck?: number;
    /** Number of times the environment has been restarted */
    restartCount?: number;
    /** Last error encountered, if status is 'error' */
    lastError?: ExecutionEnvironmentError;
}

/**
 * Active query state.
 * Tracks when a query is currently being processed.
 */
export interface ActiveQueryState {
    /** When the query started */
    startedAt: number;
}

/**
 * Runtime state for a session.
 * This is computed/derived state, never persisted.
 *
 * Separates two concerns:
 * - executionEnvironment: Is the container healthy/available?
 * - activeQuery: Is there work currently in progress?
 */
export interface SessionRuntimeState {
    /** Whether the session is currently loaded in memory on the server */
    isLoaded: boolean;

    /** Execution environment state, null if no environment exists */
    executionEnvironment: ExecutionEnvironmentState | null;

    /** Active query state, undefined if no query is running */
    activeQuery?: ActiveQueryState;
}


// =============================================================================
// Client-Facing Types (persistence data + runtime state)
// =============================================================================

/**
 * Session data returned to clients in list views.
 * Combines persisted data with runtime state.
 */
export interface SessionListItem extends PersistedSessionListData {
    runtime: SessionRuntimeState;
}

/**
 * Full session data returned to clients.
 * Includes parsed blocks and subagent conversations.
 */
export interface RuntimeSessionData extends SessionListItem {
    blocks: ConversationBlock[],
    workspaceFiles: WorkspaceFile[],
    subagents: {
        id: string,
        blocks: ConversationBlock[],
    }[]
}



// Create Session Args 
export interface CreateSessionArgs { 
    agentProfileRef : string, 
    architecture : AgentArchitecture,
    command? : string,
    defaultWorkspaceFiles? : WorkspaceFile[]
    sessionOptions? : AgentArchitectureSessionOptions
}

