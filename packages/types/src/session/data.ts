import { AgentArchitecture, AgentArchitectureSessionOptions } from "../agent-architectures/architecture.js";
import type { SessionConversationState } from "./state/conversation-state.js";

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
     * Stringified raw transcript blob from the agent application. One of the CombinedTranscript types from the agent-architectures package.
     */
    rawTranscript?: string,
    /**
     * The workspace files used / created during the session.
     */
    workspaceFiles: WorkspaceFile[]
}



// Create Session Args
export interface CreateSessionArgs {
    agentProfileRef : string,
    architecture : AgentArchitecture,
    command? : string,
    defaultWorkspaceFiles? : WorkspaceFile[]
    sessionOptions? : AgentArchitectureSessionOptions
}

