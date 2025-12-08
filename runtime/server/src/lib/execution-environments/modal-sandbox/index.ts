/**
 * ModalSandboxExecutionEnvironment
 *
 * ExecutionEnvironment implementation that runs agent queries in Modal sandboxes.
 * Uses the CLI scripts from @hhopkins/agent-runner package for session setup
 * and query execution.
 */

import { Sandbox } from 'modal';
import * as tar from 'tar-stream';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

import type {
    AgentArchitectureSessionOptions,
    AgentProfile,
    StreamEvent,
    WorkspaceFile,
    AGENT_ARCHITECTURE_TYPE,
} from '@ai-systems/shared-types';
import type { SetupSessionInput, SetupSessionResult, McpServerConfig } from '../../../../../runner/dist';

import { ExecutionEnvironment, WorkspaceFileEvent, TranscriptChangeEvent } from '../base';
import { ModalContext } from './modal/client';
import { createModalSandbox } from './modal/create-sandbox';
import { logger } from '../../../config/logger';
import { normalizeString } from '../../util/normalize-string';
import type { CombinedClaudeTranscript } from '@hhopkins/agent-converters/claude-sdk';

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Base paths in the sandbox environment
 */
const SANDBOX_PATHS = {
    APP_DIR: '/app',
    WORKSPACE_DIR: '/workspace',
    HOME_DIR: '/root',
    BUNDLED_MCP_DIR: '/mcps',
} as const;

/**
 * ModalSandboxExecutionEnvironment - Runs agents in Modal sandboxes
 */
export class ModalSandboxExecutionEnvironment implements ExecutionEnvironment {
    private readonly sandbox: Sandbox;
    private readonly sessionId: string;
    private readonly architecture: AGENT_ARCHITECTURE_TYPE;
    private agentProfile?: AgentProfile;

    private constructor(
        sandbox: Sandbox,
        sessionId: string,
        architecture: AGENT_ARCHITECTURE_TYPE
    ) {
        this.sandbox = sandbox;
        this.sessionId = sessionId;
        this.architecture = architecture;
    }

    /**
     * Create a new ModalSandboxExecutionEnvironment
     */
    static async create(
        sessionId: string,
        architecture: AGENT_ARCHITECTURE_TYPE,
        agentProfile: AgentProfile,
        modalContext: ModalContext
    ): Promise<ModalSandboxExecutionEnvironment> {
        logger.info({ sessionId, architecture }, 'Creating Modal sandbox execution environment');

        // Create the Modal sandbox
        const sandbox = await createModalSandbox(modalContext, agentProfile);

        const env = new ModalSandboxExecutionEnvironment(sandbox, sessionId, architecture);

        // Copy execution scripts to sandbox
        await env.copyExecutionScripts();

        // Copy bundled MCPs if any
        if (agentProfile.bundledMCPs && agentProfile.bundledMCPs.length > 0) {
            await env.copyBundledMCPs(agentProfile);
        }

        return env;
    }

    // =========================================================================
    // ExecutionEnvironment Interface
    // =========================================================================

    getId(): string {
        return this.sandbox.sandboxId;
    }

    async prepareSession(args: {
        sessionId: string;
        agentProfile: AgentProfile;
        workspaceFiles: WorkspaceFile[];
        sessionTranscript?: string;
        sessionOptions?: AgentArchitectureSessionOptions;
    }): Promise<void> {
        logger.info({ sessionId: args.sessionId, architecture: this.architecture }, 'Preparing session');

        this.agentProfile = args.agentProfile;

        // Build SetupSessionInput for the CLI script
        const setupInput: SetupSessionInput = {
            projectDir: SANDBOX_PATHS.WORKSPACE_DIR,
            architecture: this.mapArchitecture(this.architecture),
            sessionId: args.sessionId,
            sessionTranscript: args.sessionTranscript,
            entities: {
                skills: args.agentProfile.skills,
                commands: args.agentProfile.commands,
                agents: args.agentProfile.agents,
                hooks: args.agentProfile.hooks,
                claudeMd: args.agentProfile.claudeMd,
            },
            mcpServers: this.buildMcpServers(args.agentProfile),
        };

        // Write workspace files first
        if (args.workspaceFiles.length > 0) {
            const filesToWrite = args.workspaceFiles
                .filter(f => f.content !== undefined)
                .map(f => ({
                    path: path.join(SANDBOX_PATHS.WORKSPACE_DIR, f.path),
                    content: f.content!,
                }));
            await this.writeFiles(filesToWrite);
        }

        // Run setup-session CLI script
        const result = await this.runSetupSession(setupInput);

        if (!result.success) {
            throw new Error(`Session setup failed: ${result.errors?.join(', ')}`);
        }

        logger.info({ filesWritten: result.filesWritten.length }, 'Session prepared');
    }

    async *executeQuery(args: {
        query: string;
        options?: AgentArchitectureSessionOptions;
    }): AsyncGenerator<StreamEvent> {
        logger.info({ sessionId: this.sessionId, queryLength: args.query.length }, 'Executing query');

        const command = [
            'npx', 'tsx',
            path.join(SANDBOX_PATHS.APP_DIR, 'src/cli/execute-query.ts'),
            args.query,
            '--architecture', this.mapArchitecture(this.architecture),
            '--session-id', this.sessionId,
            '--cwd', SANDBOX_PATHS.WORKSPACE_DIR,
        ];

        // Add model if specified
        const model = (args.options as any)?.model;
        if (model) {
            command.push('--model', model);
        }

        // Add tools if available from profile
        // if (this.agentProfile?.tools && this.agentProfile.tools.length > 0) {
        //     command.push('--tools', JSON.stringify(this.agentProfile.tools));
        // }

        const process = await this.sandbox.exec(command, { workdir: SANDBOX_PATHS.WORKSPACE_DIR });

        // Stream stdout line by line and parse as JSONL
        const reader = process.stdout.getReader();
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += value;

                // Process complete lines
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;

                    try {
                        const event = JSON.parse(trimmed) as StreamEvent;
                        yield event;
                    } catch (parseError) {
                        logger.warn({ line: trimmed.substring(0, 100) }, 'Failed to parse JSONL line');
                    }
                }
            }

            // Process any remaining buffer
            if (buffer.trim()) {
                try {
                    const event = JSON.parse(buffer.trim()) as StreamEvent;
                    yield event;
                } catch (parseError) {
                    logger.warn({ line: buffer.trim().substring(0, 100) }, 'Failed to parse final JSONL line');
                }
            }
        } finally {
            reader.releaseLock();
        }

        const exitCode = await process.wait();
        if (exitCode !== 0) {
            const stderr = await process.stderr.readText();
            logger.error({ exitCode, stderr: stderr.substring(0, 500) }, 'Query execution failed');
        }
    }

    async readSessionTranscript(): Promise<string | null> {
        if (this.architecture === 'claude-agent-sdk') {
            return this.readClaudeTranscript();
        } else if (this.architecture === 'opencode') {
            return this.readOpenCodeTranscript();
        }
        return null;
    }

    async getWorkspaceFiles(): Promise<WorkspaceFile[]> {
        const files = await this.listFiles(SANDBOX_PATHS.WORKSPACE_DIR);
        const workspaceFiles: WorkspaceFile[] = [];

        for (const filePath of files) {
            // Get relative path
            let relativePath = filePath;
            if (filePath.startsWith(SANDBOX_PATHS.WORKSPACE_DIR)) {
                relativePath = filePath.slice(SANDBOX_PATHS.WORKSPACE_DIR.length);
                if (relativePath.startsWith('/')) {
                    relativePath = relativePath.slice(1);
                }
            }

            // Skip hidden directories like .claude/
            if (relativePath.startsWith('.')) continue;

            const content = await this.readFile(filePath);
            workspaceFiles.push({
                path: relativePath,
                content: content ?? undefined,
            });
        }

        return workspaceFiles;
    }

    async watchWorkspaceFiles(callback: (event: WorkspaceFileEvent) => void): Promise<void> {
        await this.watch(SANDBOX_PATHS.WORKSPACE_DIR, (event) => {
            callback({
                type: event.type,
                path: event.path,
                content: event.content,
            });
        });
    }

    async watchSessionTranscriptChanges(callback: (event: TranscriptChangeEvent) => void): Promise<void> {
        if (this.architecture === 'claude-agent-sdk') {
            const transcriptDir = this.getClaudeTranscriptDir();
            await this.watch(transcriptDir, async () => {
                // On any change, read and emit the full combined transcript
                const transcript = await this.readClaudeTranscript();
                if (transcript) {
                    callback({ content: transcript });
                }
            }, { ignorePatterns: [] });
        } else if (this.architecture === 'opencode') {
            // OpenCode stores transcripts differently
            const storagePath = '/root/.local/share/opencode';
            await this.watch(storagePath, async () => {
                const transcript = await this.readOpenCodeTranscript();
                if (transcript) {
                    callback({ content: transcript });
                }
            }, { ignorePatterns: [] });
        }
    }

    async isHealthy(): Promise<boolean> {
        const exitCode = await this.sandbox.poll();
        return exitCode === null;
    }

    async cleanup(): Promise<void> {
        logger.info({ sandboxId: this.sandbox.sandboxId }, 'Cleaning up sandbox');
        await this.sandbox.terminate();
    }

    // =========================================================================
    // Private Helpers - File Operations
    // =========================================================================

    private async readFile(filePath: string): Promise<string | null> {
        const file = await this.sandbox.open(filePath, 'r');
        try {
            const content = await file.read();
            if (content.length === 0) return null;
            return new TextDecoder().decode(content) ?? null;
        } finally {
            await file.close();
        }
    }

    private async writeFile(filePath: string, content: string): Promise<void> {
        const directory = path.dirname(filePath);
        await this.createDirectory(directory);

        const file = await this.sandbox.open(filePath, 'w');
        try {
            await file.write(new TextEncoder().encode(content));
        } finally {
            await file.close();
        }
    }

    private async writeFiles(files: { path: string; content: string }[]): Promise<void> {
        if (files.length === 0) return;

        // Create tar archive in memory
        const pack = tar.pack();

        for (const file of files) {
            // Strip leading slash for tar (paths should be relative)
            const tarPath = file.path.replace(/^\//, '');
            pack.entry({ name: tarPath }, file.content);
        }
        pack.finalize();

        // Collect tar data into buffer
        const chunks: Uint8Array[] = [];
        for await (const chunk of pack) {
            chunks.push(chunk);
        }
        const tarData = Buffer.concat(chunks);

        // Extract via stdin to root
        const process = await this.sandbox.exec(['tar', '-xf', '-', '-C', '/']);
        await process.stdin.writeBytes(tarData);
        await process.stdin.close();

        const exitCode = await process.wait();
        if (exitCode !== 0) {
            const stderr = await process.stderr.readText();
            throw new Error(`Failed to write files: ${stderr}`);
        }
    }

    private async createDirectory(dirPath: string): Promise<void> {
        const result = await this.sandbox.exec(['mkdir', '-p', dirPath]);
        const exitCode = await result.wait();
        if (exitCode !== 0) {
            const stderr = await result.stderr.readText();
            throw new Error(`Failed to create directory ${dirPath}: ${stderr}`);
        }
    }

    private async listFiles(directory: string): Promise<string[]> {
        const result = await this.sandbox.exec(['find', directory, '-type', 'f']);
        const exitCode = await result.wait();
        if (exitCode !== 0) return [];

        const stdout = await result.stdout.readText();
        return stdout.trim().split('\n').filter(Boolean);
    }

    private async watch(
        watchPath: string,
        callback: (event: { type: 'add' | 'change' | 'unlink'; path: string; content?: string }) => void,
        opts?: { ignorePatterns?: string[] }
    ): Promise<void> {
        const args = ['npx', 'chokidar-cli', `${watchPath}/**/*`, '--polling'];
        if (opts?.ignorePatterns) {
            for (const pattern of opts.ignorePatterns) {
                args.push('-i', `"${pattern}"`);
            }
        }

        const watcherProcess = await this.sandbox.exec(args);

        logger.info({ watchPath }, 'File watcher started');

        // Start consuming stream in background
        (async () => {
            const reader = watcherProcess.stdout.getReader();
            let buffer = '';

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += value;

                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed) continue;

                        const colonIndex = trimmed.indexOf(':');
                        if (colonIndex === -1) continue;

                        const eventType = trimmed.slice(0, colonIndex) as 'add' | 'change' | 'unlink';
                        const filePath = trimmed.slice(colonIndex + 1);

                        if (!['add', 'change', 'unlink'].includes(eventType)) continue;

                        // Convert to relative path
                        let relativePath = filePath;
                        if (filePath.startsWith(watchPath)) {
                            relativePath = filePath.slice(watchPath.length);
                            if (relativePath.startsWith('/')) {
                                relativePath = relativePath.slice(1);
                            }
                        }

                        // Read content for add/change events
                        let content: string | undefined;
                        if (eventType !== 'unlink') {
                            try {
                                content = await this.readFile(filePath) ?? undefined;
                            } catch (err) {
                                logger.warn({ filePath, error: err }, 'Failed to read file content');
                            }
                        }

                        callback({ type: eventType, path: relativePath, content });
                    }
                }
            } catch (error) {
                logger.error({ error, watchPath }, 'Watch stream error');
            }
        })();
    }

    // =========================================================================
    // Private Helpers - Setup & Execution
    // =========================================================================

    private async copyExecutionScripts(): Promise<void> {
        const localPath = path.resolve(__dirname, '../../../../execution');
        await this.copyLocalDirectory(localPath, SANDBOX_PATHS.APP_DIR);
    }

    private async copyBundledMCPs(profile: AgentProfile): Promise<void> {
        if (!profile.bundledMCPs) return;

        for (const mcp of profile.bundledMCPs) {
            const targetPath = path.join(SANDBOX_PATHS.BUNDLED_MCP_DIR, normalizeString(mcp.name));
            await this.copyLocalDirectory(mcp.localProjectPath, targetPath);
        }
    }

    private async copyLocalDirectory(localDirPath: string, targetPath: string): Promise<void> {
        if (!fs.existsSync(localDirPath)) {
            logger.warn({ localDirPath }, 'Local directory not found, skipping');
            return;
        }

        const ignorePatterns = ['node_modules', 'package.json', 'requirements.txt', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];
        const filesToWrite: { path: string; content: string }[] = [];

        const processDir = (dir: string, relativePath: string = '') => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

                if (ignorePatterns.includes(entry.name)) continue;

                if (entry.isDirectory()) {
                    processDir(fullPath, relPath);
                } else if (entry.isFile()) {
                    const content = fs.readFileSync(fullPath, 'utf-8');
                    filesToWrite.push({
                        path: path.join(targetPath, relPath),
                        content,
                    });
                }
            }
        };

        processDir(localDirPath);
        await this.writeFiles(filesToWrite);

        logger.info({ fileCount: filesToWrite.length, targetPath }, 'Copied local files to sandbox');
    }

    private async runSetupSession(input: SetupSessionInput): Promise<SetupSessionResult> {
        const command = ['npx', 'tsx', path.join(SANDBOX_PATHS.APP_DIR, 'src/cli/setup-session.ts')];

        const process = await this.sandbox.exec(command, { workdir: SANDBOX_PATHS.WORKSPACE_DIR });

        // Write input to stdin
        const inputJson = JSON.stringify(input);
        await process.stdin.writeBytes(new TextEncoder().encode(inputJson));
        await process.stdin.close();

        const exitCode = await process.wait();
        const stdout = await process.stdout.readText();

        if (exitCode !== 0) {
            const stderr = await process.stderr.readText();
            logger.error({ exitCode, stderr }, 'Setup session failed');
            return { success: false, filesWritten: [], errors: [stderr] };
        }

        try {
            return JSON.parse(stdout) as SetupSessionResult;
        } catch (error) {
            logger.error({ stdout }, 'Failed to parse setup result');
            return { success: false, filesWritten: [], errors: ['Failed to parse setup result'] };
        }
    }

    private buildMcpServers(profile: AgentProfile): Record<string, McpServerConfig> | undefined {
        if (!profile.bundledMCPs || profile.bundledMCPs.length === 0) return undefined;

        const servers: Record<string, McpServerConfig> = {};

        for (const mcp of profile.bundledMCPs) {
            const serverPath = path.join(SANDBOX_PATHS.BUNDLED_MCP_DIR, normalizeString(mcp.name));
            const parts = mcp.startCommand.split(/\s+/);
            const command = parts[0] ?? '';
            const args = parts.slice(1).map(arg => {
                if (!arg.startsWith('-') && !arg.startsWith('/') && !arg.includes('=')) {
                    return path.join(serverPath, arg);
                }
                return arg;
            });

            servers[mcp.name] = { command, args };
        }

        return servers;
    }

    private mapArchitecture(arch: AGENT_ARCHITECTURE_TYPE): 'claude-sdk' | 'opencode' {
        switch (arch) {
            case 'claude-agent-sdk':
                return 'claude-sdk';
            case 'opencode':
                return 'opencode';
            default:
                return 'claude-sdk';
        }
    }

    // =========================================================================
    // Private Helpers - Transcript Reading
    // =========================================================================

    private getClaudeTranscriptDir(): string {
        // Claude SDK uses a hash of the project path
        const projectHash = createHash('sha256')
            .update(SANDBOX_PATHS.WORKSPACE_DIR)
            .digest('hex')
            .substring(0, 16);
        return path.join(SANDBOX_PATHS.HOME_DIR, '.claude/projects', projectHash);
    }

    private async readClaudeTranscript(): Promise<string | null> {
        const transcriptDir = this.getClaudeTranscriptDir();

        // Read main transcript
        const mainPath = path.join(transcriptDir, `${this.sessionId}.jsonl`);
        const mainContent = await this.readFile(mainPath);

        if (!mainContent) return null;

        // Find and read subagent transcripts
        const files = await this.listFiles(transcriptDir);
        const subagentFiles = files.filter(f =>
            f.includes('agent-') && f.endsWith('.jsonl') && !f.includes(this.sessionId)
        );

        const subagents: { id: string; transcript: string }[] = [];
        for (const subFile of subagentFiles) {
            const content = await this.readFile(subFile);
            if (content) {
                const basename = path.basename(subFile, '.jsonl');
                subagents.push({ id: basename, transcript: content });
            }
        }

        // Return combined format
        const combined: CombinedClaudeTranscript = {
            main: mainContent,
            subagents,
        };

        return JSON.stringify(combined);
    }

    private async readOpenCodeTranscript(): Promise<string | null> {
        // Export OpenCode session to get transcript
        const result = await this.sandbox.exec(['opencode', 'session', 'export', this.sessionId]);
        const exitCode = await result.wait();

        if (exitCode !== 0) return null;

        const stdout = await result.stdout.readText();
        return stdout || null;
    }
}

// Re-export for convenience
export type { ModalContext } from './modal/client.js';
