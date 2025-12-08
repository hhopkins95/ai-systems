import {
    AGENT_ARCHITECTURE_TYPE,
    AgentArchitectureSessionOptions,
    AgentProfile,
    StreamEvent,
    WorkspaceFile
} from "@ai-systems/shared-types";
import { EnvironmentPrimitive, WatchEvent } from "../lib/environment-primitives/base";
import { getEnvironmentPrimitive } from "../lib/environment-primitives/factory";
import { RuntimeExecutionEnvironmentOptions } from "../types/runtime";

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
 * Configuration for creating an ExecutionEnvironment
 */
export interface ExecutionEnvironmentConfig {
    sessionId: string;
    architecture: AGENT_ARCHITECTURE_TYPE;
    agentProfile: AgentProfile;
    environmentOptions: RuntimeExecutionEnvironmentOptions;
}

/**
 * ExecutionEnvironment - Unified class for running agent queries
 *
 * This class abstracts the execution environment (Modal sandbox, local process, Docker, etc.)
 * and provides a consistent API for:
 * - Session preparation (writing agent profile, workspace files, MCP config)
 * - Query execution (running the agent SDK, streaming events)
 * - File watching (workspace changes, transcript updates)
 * - Lifecycle management (health checks, cleanup)
 *
 * Uses the CLI scripts from @hhopkins/agent-runner package internally.
 * Delegates primitive operations to EnvironmentPrimitive implementations.
 */
export class ExecutionEnvironment {
    private readonly primitives: EnvironmentPrimitive;
    private readonly architecture: AGENT_ARCHITECTURE_TYPE;
    private readonly sessionId: string;
    private readonly agentProfile: AgentProfile;

    private constructor(
        primitives: EnvironmentPrimitive,
        architecture: AGENT_ARCHITECTURE_TYPE,
        sessionId: string,
        agentProfile: AgentProfile
    ) {
        this.primitives = primitives;
        this.architecture = architecture;
        this.sessionId = sessionId;
        this.agentProfile = agentProfile;
    }

    /**
     * Create a new ExecutionEnvironment
     */
    static async create(config: ExecutionEnvironmentConfig): Promise<ExecutionEnvironment> {
        const primitives = await getEnvironmentPrimitive(config.environmentOptions);

        return new ExecutionEnvironment(
            primitives,
            config.architecture,
            config.sessionId,
            config.agentProfile
        );
    }

    /**
     * Get the unique identifier for this execution environment instance
     */
    getId(): string {
        return this.primitives.getId();
    }

    /**
     * Get the base paths for this environment
     */
    getBasePaths() {
        return this.primitives.getBasePaths();
    }

    /**
     * Prepare the session environment
     * - Creates workspace directory structure
     * - Writes agent profile entities (.claude/ files)
     * - Writes workspace files
     * - Configures MCP servers
     * -- Copies bundled MCPs into the environment and installs dependencies
     * -- 
     * - Restores session transcript if resuming
     */
    async prepareSession(args: {
        sessionId: string;
        agentProfile: AgentProfile;
        workspaceFiles: WorkspaceFile[];
        sessionTranscript?: string;
        sessionOptions?: AgentArchitectureSessionOptions;
    }): Promise<void> {
        throw new Error("Not implemented - requires runner setup-session script integration");
    }

    /**
     * Execute a query against the agent
     * Yields StreamEvents as they are produced by the agent
     */
    async *executeQuery(args: {
        query: string;
        options?: AgentArchitectureSessionOptions;
    }): AsyncGenerator<StreamEvent> {
        throw new Error("Not implemented - requires runner execute-query script integration");
    }

    /**
     * Read the current session transcript
     * Returns the raw transcript content or null if not available
     */
    async readSessionTranscript(): Promise<string | null> {
        throw new Error("Not implemented - requires runner read-transcript script");
    }

    /**
     * Get all workspace files currently in the environment
     * Returns files with their current content
     */
    async getWorkspaceFiles(): Promise<WorkspaceFile[]> {
        const { WORKSPACE_DIR } = this.primitives.getBasePaths();
        const filePaths = await this.primitives.listFiles(WORKSPACE_DIR);
        const workspaceFiles: WorkspaceFile[] = [];

        for (const filePath of filePaths) {
            // Get relative path from workspace dir
            let relativePath = filePath;
            if (filePath.startsWith(WORKSPACE_DIR)) {
                relativePath = filePath.slice(WORKSPACE_DIR.length);
                if (relativePath.startsWith('/')) {
                    relativePath = relativePath.slice(1);
                }
            }

            // Skip hidden directories like .claude/
            if (relativePath.startsWith('.')) continue;

            const content = await this.primitives.readFile(filePath);
            workspaceFiles.push({
                path: relativePath,
                content: content ?? undefined,
            });
        }

        return workspaceFiles;
    }

    /**
     * Watch for workspace file changes
     * Callback is invoked for each file add/change/unlink event
     * Promise resolves when watcher is ready
     */
    async watchWorkspaceFiles(callback: (event: WorkspaceFileEvent) => void): Promise<void> {
        const { WORKSPACE_DIR } = this.primitives.getBasePaths();

        await this.primitives.watch(WORKSPACE_DIR, (event: WatchEvent) => {
            callback({
                type: event.type,
                path: event.path,
                content: event.content,
            });
        });
    }

    /**
     * Watch for session transcript changes
     * Callback is invoked when the transcript is updated
     * Promise resolves when watcher is ready
     */
    async watchSessionTranscriptChanges(callback: (event: TranscriptChangeEvent) => void): Promise<void> {
        throw new Error("Not implemented - requires runner transcript watch integration");
    }

    /**
     * Check if the execution environment is healthy and running
     */
    async isHealthy(): Promise<boolean> {
        return await this.primitives.isRunning();
    }

    /**
     * Clean up resources (terminate sandbox, stop processes, etc.)
     */
    async cleanup(): Promise<void> {
        await this.primitives.terminate();
    }
}
