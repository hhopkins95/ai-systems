import { AgentArchitectureSessionOptions, AgentProfile, StreamEvent, WorkspaceFile } from "@ai-systems/shared-types";

/**
 * Event emitted when a workspace file changes
 */
export interface WorkspaceFileEvent {
    type: 'add' | 'change' | 'unlink';
    path: string;
    content?: string;
}

/**
 * Event emitted when a transcript changes.
 * Contains the full combined transcript (main + subagents as a single JSON blob).
 */
export interface TranscriptChangeEvent {
    content: string;
}

/**
 * ExecutionEnvironment - Unified interface for running agent queries
 *
 * This interface abstracts the execution environment (Modal sandbox, local process, Docker, etc.)
 * and provides a consistent API for:
 * - Session preparation (writing agent profile, workspace files, MCP config)
 * - Query execution (running the agent SDK, streaming events)
 * - File watching (workspace changes, transcript updates)
 * - Lifecycle management (health checks, cleanup)
 *
 * Implementations should:
 * - Use the CLI scripts from @hhopkins/agent-execution package
 * - Parse JSONL output from CLI scripts into StreamEvents
 * - Handle sandbox/process lifecycle internally
 */
export interface ExecutionEnvironment {
    /**
     * Get the unique identifier for this execution environment instance
     */
    getId(): string;

    /**
     * Prepare the session environment
     * - Creates workspace directory structure
     * - Writes agent profile entities (.claude/ files)
     * - Writes workspace files
     * - Configures MCP servers
     * - Restores session transcript if resuming
     */
    prepareSession: (args: {
        sessionId: string;
        agentProfile: AgentProfile;
        workspaceFiles: WorkspaceFile[];
        sessionTranscript?: string;
        sessionOptions?: AgentArchitectureSessionOptions;
    }) => Promise<void>;

    /**
     * Execute a query against the agent
     * Yields StreamEvents as they are produced by the agent
     */
    executeQuery: (args: {
        query: string;
        options?: AgentArchitectureSessionOptions;
    }) => AsyncGenerator<StreamEvent>;

    /**
     * Read the current session transcript
     * Returns the raw transcript content or null if not available
     */
    readSessionTranscript: () => Promise<string | null>;

    /**
     * Get all workspace files currently in the environment
     * Returns files with their current content
     */
    getWorkspaceFiles: () => Promise<WorkspaceFile[]>;

    /**
     * Watch for workspace file changes
     * Callback is invoked for each file add/change/unlink event
     * Promise resolves when watcher is ready
     */
    watchWorkspaceFiles: (callback: (event: WorkspaceFileEvent) => void) => Promise<void>;

    /**
     * Watch for session transcript changes
     * Callback is invoked when the transcript is updated
     * Promise resolves when watcher is ready
     */
    watchSessionTranscriptChanges: (callback: (event: TranscriptChangeEvent) => void) => Promise<void>;

    /**
     * Check if the execution environment is healthy and running
     */
    isHealthy: () => Promise<boolean>;

    /**
     * Clean up resources (terminate sandbox, stop processes, etc.)
     */
    cleanup: () => Promise<void>;
}