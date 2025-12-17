import {
    AgentArchitecture,
    AgentArchitectureSessionOptions,
    AgentProfile,
    StreamEvent,
    WorkspaceFile,
    LogEvent,
    ScriptOutput,
    isLogEvent,
    isScriptOutput,
} from "@ai-systems/shared-types";
import { logger } from '../../config/logger.js';
import { deriveSessionPaths, EnvironmentPrimitive, SessionPaths, WatchEvent } from "../../lib/environment-primitives/base";
import { getEnvironmentPrimitive } from "../../lib/environment-primitives/factory";
import { RuntimeExecutionEnvironmentOptions } from "../../types/runtime";
import {
    getRunnerBundleContent,
    type LoadAgentProfileInput,
    type LoadSessionTranscriptInput,
    type ExecuteQueryArgs,
    type ReadSessionTranscriptInput,
} from "@hhopkins/agent-runner";
import { getAdapterBundleContent } from "@ai-systems/opencode-claude-adapter/bundle";
import type { SessionEventBus } from "./session-event-bus.js";

import { join } from "path";

/**
 * Forward a LogEvent to the server logger
 */
function forwardLogEvent(event: LogEvent): void {
    const logFn = event.level === 'error' ? logger.error
        : event.level === 'warn' ? logger.warn
        : event.level === 'debug' ? logger.debug
        : logger.info;
    logFn.call(logger, { runnerLog: true, ...event.data }, `[Runner] ${event.message}`);
}

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
    architecture: AgentArchitecture;
    agentProfile: AgentProfile;
    environmentOptions: RuntimeExecutionEnvironmentOptions;
    /** Event bus for emitting session events (required for new architecture) */
    eventBus: SessionEventBus;
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
    private readonly paths: SessionPaths;
    private readonly architecture: AgentArchitecture;
    private readonly sessionId: string;
    private readonly agentProfile: AgentProfile;
    private readonly eventBus: SessionEventBus;

    private constructor(
        primitives: EnvironmentPrimitive,
        paths: SessionPaths,
        architecture: AgentArchitecture,
        sessionId: string,
        agentProfile: AgentProfile,
        eventBus: SessionEventBus
    ) {
        this.primitives = primitives;
        this.paths = paths;
        this.architecture = architecture;
        this.sessionId = sessionId;
        this.agentProfile = agentProfile;
        this.eventBus = eventBus;
    }

    /**
     * Create a new ExecutionEnvironment
     */
    static async create(config: ExecutionEnvironmentConfig): Promise<ExecutionEnvironment> {
        const primitives = await getEnvironmentPrimitive(config.environmentOptions);

        // Derive all paths from session root
        const { SESSION_DIR } = primitives.getBasePaths();
        const paths = deriveSessionPaths(SESSION_DIR);


        // Create session subdirectories
        await Promise.all([
            primitives.createDirectory(paths.appDir),
            primitives.createDirectory(paths.workspaceDir),
            primitives.createDirectory(paths.mcpDir),
            primitives.createDirectory(paths.claudeConfigDir),
        ]);

        // Install runner bundle into the execution environment
        const runnerContent = getRunnerBundleContent();
        await primitives.writeFile(join(paths.appDir, 'runner.js'), runnerContent);
        await primitives.writeFile(join(paths.appDir, 'package.json'), JSON.stringify({
            name: "agent-runner",
            type: "module"
        }));

        // Install opencode adapter bundle for opencode architecture support
        const adapterDir = join(paths.appDir, 'opencode-adapter');
        await primitives.createDirectory(adapterDir);
        await primitives.writeFile(join(adapterDir, 'index.js'), getAdapterBundleContent());
        await primitives.writeFile(join(adapterDir, 'package.json'), JSON.stringify({
            name: "@ai-systems/opencode-claude-adapter",
            main: "./index.js",
            type: "module"
        }));

        return new ExecutionEnvironment(
            primitives,
            paths,
            config.architecture,
            config.sessionId,
            config.agentProfile,
            config.eventBus
        );
    }

    /**
     * Get the unique identifier for this execution environment instance
     */
    getId(): string {
        return this.primitives.getId();
    }

    /**
     * Get the derived session paths for this environment
     */
    getPaths(): SessionPaths {
        return this.paths;
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
        // 1. Write workspace files
        if (args.workspaceFiles.length > 0) {
            await this.primitives.writeFiles(
                args.workspaceFiles.map(f => ({
                    path: join(this.paths.workspaceDir, f.path),
                    content: f.content
                }))
            );
        }

        // 2. Load agent profile via runner
        const loadProfileInput: LoadAgentProfileInput = {
            baseWorkspacePath: this.paths.sessionDir,
            agentProfile: args.agentProfile,
            architectureType: this.architecture
        };

        const profileProcess = await this.primitives.exec(
            ['node', join(this.paths.appDir, 'runner.js'), 'load-agent-profile'],
            { cwd: this.paths.appDir }
        );
        await profileProcess.stdin.writeText(JSON.stringify(loadProfileInput));
        await profileProcess.stdin.close();

        // Consume output and wait for process
        const [, profileOutput] = await Promise.all([
            profileProcess.wait(),
            this.consumeRunnerOutput(profileProcess.stdout)
        ]);

        if (!profileOutput?.success) {
            throw new Error(`Failed to load agent profile: ${profileOutput?.error || 'Unknown error'}`);
        }

        // 3. Load session transcript if resuming
        if (args.sessionTranscript) {
            const loadTranscriptInput: LoadSessionTranscriptInput = {
                baseWorkspacePath: this.paths.sessionDir,
                sessionTranscript: args.sessionTranscript,
                sessionId: args.sessionId,
                architectureType: this.architecture
            };

            const transcriptProcess = await this.primitives.exec(
                ['node', join(this.paths.appDir, 'runner.js'), 'load-session-transcript'],
                { cwd: this.paths.appDir }
            );
            await transcriptProcess.stdin.writeText(JSON.stringify(loadTranscriptInput));
            await transcriptProcess.stdin.close();

            // Consume output and wait for process
            const [, transcriptOutput] = await Promise.all([
                transcriptProcess.wait(),
                this.consumeRunnerOutput(transcriptProcess.stdout)
            ]);

            if (!transcriptOutput?.success) {
                throw new Error(`Failed to load session transcript: ${transcriptOutput?.error || 'Unknown error'}`);
            }
        }
    }

    /**
     * Execute a query against the agent
     * Emits StreamEvents to the SessionEventBus as they are produced
     */
    async executeQuery(args: {
        query: string;
        options?: AgentArchitectureSessionOptions;
    }): Promise<void> {
        // Prepare input for stdin
        const executeInput: ExecuteQueryArgs = {
            prompt: args.query,
            architecture: this.architecture,
            sessionId: this.sessionId,
            baseWorkspacePath: this.paths.sessionDir,
            model: args.options?.model,
        };

        const process = await this.primitives.exec(
            ['node', join(this.paths.appDir, 'runner.js'), 'execute-query'],
            { cwd: this.paths.appDir }
        );

        // Write input to stdin and close
        await process.stdin.writeText(JSON.stringify(executeInput));
        await process.stdin.close();

        try {
            for await (const event of this.parseRunnerStream(process.stdout)) {
                this.emitStreamEvent(event);
            }
        } finally {
            await process.wait();
            // Send transcript update after query completes
            await this.sendTranscriptUpdate();
        }
    }

    /**
     * Convert a StreamEvent to SessionEventBus events and emit
     */
    private emitStreamEvent(event: StreamEvent): void {
        switch (event.type) {
            case 'block_start':
                this.eventBus.emit('block:start', {
                    conversationId: event.conversationId,
                    block: event.block,
                });
                break;

            case 'text_delta':
                this.eventBus.emit('block:delta', {
                    conversationId: event.conversationId,
                    blockId: event.blockId,
                    delta: event.delta,
                });
                break;

            case 'block_update':
                this.eventBus.emit('block:update', {
                    conversationId: event.conversationId,
                    blockId: event.blockId,
                    updates: event.updates,
                });
                break;

            case 'block_complete':
                this.eventBus.emit('block:complete', {
                    conversationId: event.conversationId,
                    blockId: event.blockId,
                    block: event.block,
                });
                break;

            case 'metadata_update':
                this.eventBus.emit('metadata:update', {
                    conversationId: event.conversationId,
                    metadata: event.metadata,
                });
                break;

            case 'log':
                this.eventBus.emit('log', {
                    level: event.level,
                    message: event.message,
                    data: event.data,
                });
                break;

            case 'error':
                this.eventBus.emit('error', {
                    message: event.message,
                    code: event.code,
                });
                break;

            case 'status':
                // Status events from runner are handled at AgentSession level
                // since they need to update SessionState
                // We emit a log for debugging
                logger.debug({ status: event.status, message: event.message }, 'Runner status event');
                break;

            case 'script_output':
                // Script output is internal, not emitted to bus
                break;
        }
    }

    /**
     * Helper to send transcript update to event bus
     */
    private async sendTranscriptUpdate(): Promise<void> {
        const transcript = await this.readSessionTranscript();
        logger.info("Fetched transcript: " + transcript);
        if (transcript) {
            this.eventBus.emit('transcript:changed', { content: transcript });
        } else { 
            this.eventBus.emit('error', {
                message: "Failed to fetch transcript",
                code: "TRANSCRIPT_FETCH_FAILED",
            });
        }
    }

    /**
     * Parse JSONL StreamEvents from a runner process stdout
     * Yields all valid StreamEvents and forwards log events to server logger
     */
    private async *parseRunnerStream(
        stdout: ReadableStream
    ): AsyncGenerator<StreamEvent> {
        const reader = stdout.getReader();
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = typeof value === 'string' ? value : new TextDecoder().decode(value);
                buffer += chunk;
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const event = JSON.parse(line) as StreamEvent;
                            // Forward log events to server logger
                            if (isLogEvent(event)) {
                                forwardLogEvent(event);
                            }
                            yield event;
                        } catch {
                            // Skip malformed JSON lines
                        }
                    }
                }
            }

            // Process any remaining buffer
            if (buffer.trim()) {
                try {
                    const event = JSON.parse(buffer) as StreamEvent;
                    // Forward log events to server logger
                    if (isLogEvent(event)) {
                        forwardLogEvent(event);
                    }
                    yield event;
                } catch {
                    // Skip malformed JSON
                }
            }
        } finally {
            reader.releaseLock();
        }
    }

    /**
     * Consume runner output and return the final ScriptOutput
     * Forwards log events to server logger while consuming
     */
    private async consumeRunnerOutput<T = unknown>(
        stdout: ReadableStream
    ): Promise<ScriptOutput<T> | null> {
        let lastScriptOutput: ScriptOutput<T> | null = null;

        for await (const event of this.parseRunnerStream(stdout)) {
            if (isScriptOutput(event)) {
                lastScriptOutput = event as ScriptOutput<T>;
            }
        }

        return lastScriptOutput;
    }

    /**
     * Read the current session transcript
     * Returns the raw transcript content or null if not available
     */
    async readSessionTranscript(): Promise<string | null> {
        // Prepare input for stdin
        const readTranscriptInput: ReadSessionTranscriptInput = {
            baseWorkspacePath: this.paths.sessionDir,
            sessionId: this.sessionId,
            architecture: this.architecture,
        };

        const process = await this.primitives.exec(
            ['node', join(this.paths.appDir, 'runner.js'), 'read-session-transcript'],
            { cwd: this.paths.appDir }
        );

        // Write input to stdin and close
        await process.stdin.writeText(JSON.stringify(readTranscriptInput));
        await process.stdin.close();

        // Consume output and wait for process
        const [, output] = await Promise.all([
            process.wait(),
            this.consumeRunnerOutput<{ transcript: string }>(process.stdout)
        ]);


        console.log("Transcript Read Output: " + JSON.stringify(output));

        if (!output?.success || !output.data?.transcript) {
            return null;
        }

        return output.data.transcript;
    }

    /**
     * Get all workspace files currently in the environment
     * Returns files with their current content
     */
    async getWorkspaceFiles(): Promise<WorkspaceFile[]> {
        const filePaths = await this.primitives.listFiles(this.paths.workspaceDir);
        const workspaceFiles: WorkspaceFile[] = [];

        for (const filePath of filePaths) {
            // Get relative path from workspace dir
            let relativePath = filePath;
            if (filePath.startsWith(this.paths.workspaceDir)) {
                relativePath = filePath.slice(this.paths.workspaceDir.length);
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
     * Emits file events to the SessionEventBus
     * Promise resolves when watcher is ready
     */
    async watchWorkspaceFiles(): Promise<void> {
        await this.primitives.watch(this.paths.workspaceDir, (event: WatchEvent) => {
            // Skip files with no content for created/modified events
            if (event.type !== 'unlink' && event.content === undefined) {
                return;
            }

            if (event.type === 'add' && event.content !== undefined) {
                this.eventBus.emit('file:created', {
                    file: { path: event.path, content: event.content },
                });
            } else if (event.type === 'change' && event.content !== undefined) {
                this.eventBus.emit('file:modified', {
                    file: { path: event.path, content: event.content },
                });
            } else if (event.type === 'unlink') {
                this.eventBus.emit('file:deleted', {
                    path: event.path,
                });
            }
        }, {
            ignorePatterns : [
                '**/.git/**',
                '**/.claude/**',
                '**/.opencode/**',
                'opencode.json',
                '**/node_modules/**',
                '**/dist/**',
                '**/build/**',
                '**/coverage/**',
                '**/logs/**',
                '**/temp/**',
                '**/tmp/**',
                '**/cache/**',
                '**/temp-cache/**',
            ]
        });
    }

    /**
     * Watch for session transcript changes
     * Transcript updates are now emitted directly at the end of executeQuery()
     * This method is kept for backwards compatibility but does nothing
     * @deprecated Transcript changes are now emitted automatically by executeQuery
     */
    async watchSessionTranscriptChanges(): Promise<void> {
        // Transcript updates are now emitted directly in sendTranscriptUpdate()
        // which is called at the end of executeQuery()
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
