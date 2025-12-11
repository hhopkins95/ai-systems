import {
    AgentArchitecture,
    AgentArchitectureSessionOptions,
    AgentProfile,
    StreamEvent,
    WorkspaceFile,
    LogEvent,
    isLogEvent,
} from "@ai-systems/shared-types";
import { logger } from '../config/logger.js';
import { EnvironmentPrimitive, WatchEvent } from "../lib/environment-primitives/base";
import { getEnvironmentPrimitive } from "../lib/environment-primitives/factory";
import { RuntimeExecutionEnvironmentOptions } from "../types/runtime";
import { getRunnerBundleContent } from "@hhopkins/agent-runner";
import { getAdapterBundleContent } from "@ai-systems/opencode-claude-adapter/bundle";

import { join } from "path";

/**
 * Helper to read a ReadableStream to string
 */
async function readStreamToString(stream: ReadableStream): Promise<string> {
    const reader = stream.getReader();
    const chunks: string[] = [];
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(typeof value === 'string' ? value : new TextDecoder().decode(value));
        }
    } finally {
        reader.releaseLock();
    }
    return chunks.join('');
}

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
    private readonly architecture: AgentArchitecture;
    private readonly sessionId: string;
    private readonly agentProfile: AgentProfile;
    private transcriptUpdateCallback?: (event: TranscriptChangeEvent) => void;

    private constructor(
        primitives: EnvironmentPrimitive,
        architecture: AgentArchitecture,
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

        // Install runner bundle into the execution environment
        const { APP_DIR } = primitives.getBasePaths();
        const runnerContent = getRunnerBundleContent();
        await primitives.writeFile(join(APP_DIR, 'runner.js'), runnerContent);

        // Install opencode adapter bundle for opencode architecture support
        const adapterDir = join(APP_DIR, 'opencode-adapter');
        await primitives.createDirectory(adapterDir);
        await primitives.writeFile(join(adapterDir, 'index.js'), getAdapterBundleContent());
        await primitives.writeFile(join(adapterDir, 'package.json'), JSON.stringify({
            name: "@ai-systems/opencode-claude-adapter",
            main: "./index.js",
            type: "module"
        }));

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
        const { APP_DIR, WORKSPACE_DIR } = this.primitives.getBasePaths();

        // 1. Write workspace files
        if (args.workspaceFiles.length > 0) {
            await this.primitives.writeFiles(
                args.workspaceFiles.map(f => ({
                    path: join(WORKSPACE_DIR, f.path),
                    content: f.content
                }))
            );
        }

        // 2. Load agent profile via runner
        const loadProfileInput = {
            projectDirPath: WORKSPACE_DIR,
            sessionId: args.sessionId,
            agentProfile: args.agentProfile,
            architectureType: this.architecture
        };

        const profileProcess = await this.primitives.exec(
            ['node', join(APP_DIR, 'runner.js'), 'load-agent-profile'],
            { cwd: APP_DIR }
        );
        await profileProcess.stdin.writeText(JSON.stringify(loadProfileInput));
        await profileProcess.stdin.close();

        // Capture logs while waiting for process
        const [exitCode] = await Promise.all([
            profileProcess.wait(),
            this.captureRunnerLogs(profileProcess)
        ]);

        if (exitCode !== 0) {
            const stderr = await readStreamToString(profileProcess.stderr);
            throw new Error(`Failed to load agent profile: ${stderr}`);
        }

        // 3. Load session transcript if resuming
        if (args.sessionTranscript) {
            const loadTranscriptInput = {
                projectDirPath: WORKSPACE_DIR,
                sessionTranscript: args.sessionTranscript,
                sessionId: args.sessionId,
                architectureType: this.architecture
            };

            const transcriptProcess = await this.primitives.exec(
                ['node', join(APP_DIR, 'runner.js'), 'load-session-transcript'],
                { cwd: APP_DIR }
            );
            await transcriptProcess.stdin.writeText(JSON.stringify(loadTranscriptInput));
            await transcriptProcess.stdin.close();

            // Capture logs while waiting for process
            const [transcriptExit] = await Promise.all([
                transcriptProcess.wait(),
                this.captureRunnerLogs(transcriptProcess)
            ]);

            if (transcriptExit !== 0) {
                const stderr = await readStreamToString(transcriptProcess.stderr);
                throw new Error(`Failed to load session transcript: ${stderr}`);
            }
        }
    }

    /**
     * Execute a query against the agent
     * Yields StreamEvents as they are produced by the agent
     */
    async *executeQuery(args: {
        query: string;
        options?: AgentArchitectureSessionOptions;
    }): AsyncGenerator<StreamEvent> {
        const { APP_DIR, WORKSPACE_DIR } = this.primitives.getBasePaths();

        // Prepare input for stdin
        const executeInput = {
            prompt: args.query,
            architecture: this.architecture,
            sessionId: this.sessionId,
            cwd: WORKSPACE_DIR,
            model: args.options?.model,
        };

        const process = await this.primitives.exec(
            ['node', join(APP_DIR, 'runner.js'), 'execute-query'],
            { cwd: APP_DIR }
        );

        // Write input to stdin and close
        await process.stdin.writeText(JSON.stringify(executeInput));
        await process.stdin.close();

        try {
            for await (const event of this.parseRunnerStream(process.stdout)) {
                yield event;
            }
        } finally {
            await process.wait();
            // Send transcript update after query completes
            await this.sendTranscriptUpdate();
        }
    }

    /**
     * Helper to send transcript update to registered callback
     */
    private async sendTranscriptUpdate(): Promise<void> {
        if (this.transcriptUpdateCallback) {
            const transcript = await this.readSessionTranscript();
            if (transcript) {
                this.transcriptUpdateCallback({ content: transcript });
            }
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
     * Capture and log runner log events from a process's stdout
     * Used to capture logs from prepareSession scripts
     */
    private async captureRunnerLogs(process: { stdout: ReadableStream }): Promise<void> {
        // Consume the stream, forwarding logs (side effect of parseRunnerStream)
        for await (const _event of this.parseRunnerStream(process.stdout)) {
            // Events consumed but not used - logs forwarded inside parseRunnerStream
        }
    }

    /**
     * Read the current session transcript
     * Returns the raw transcript content or null if not available
     */
    async readSessionTranscript(): Promise<string | null> {
        const { APP_DIR, WORKSPACE_DIR } = this.primitives.getBasePaths();

        // Prepare input for stdin
        const readTranscriptInput = {
            sessionId: this.sessionId,
            architecture: this.architecture,
            projectDir: WORKSPACE_DIR,
        };

        const process = await this.primitives.exec(
            ['node', join(APP_DIR, 'runner.js'), 'read-session-transcript'],
            { cwd: APP_DIR }
        );

        // Write input to stdin and close
        await process.stdin.writeText(JSON.stringify(readTranscriptInput));
        await process.stdin.close();

        const exitCode = await process.wait();
        if (exitCode !== 0) {
            return null;
        }

        const stdout = await readStreamToString(process.stdout);
        return stdout || null;
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
     * Callback is invoked when the transcript is updated (at end of each executeQuery)
     * Promise resolves immediately - callback will be invoked after each query completes
     */
    async watchSessionTranscriptChanges(callback: (event: TranscriptChangeEvent) => void): Promise<void> {
        this.transcriptUpdateCallback = callback;
        // Callback will be invoked at the end of executeQuery() via sendTranscriptUpdate()
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
