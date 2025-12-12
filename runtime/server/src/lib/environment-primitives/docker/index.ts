import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { logger } from '../../../config/logger';
import { RuntimeExecutionEnvironmentOptions } from '../../../types/runtime';
import { deriveSessionPaths, EnvironmentPrimitive, WatchEvent, WatchEventType, WriteFilesResult } from '../base';
import { createProcessHandle, ProcessHandle } from '../utils/process-handle';
import { streamToString } from '../utils/stream-converter';
import { createContainer, removeContainer, isContainerRunning, installTools, DEFAULT_IMAGE } from './container';

/** Container session root - all paths are under /session */
const CONTAINER_SESSION_DIR = '/session';

export class DockerPrimitive implements EnvironmentPrimitive {

    private readonly containerId: string;
    private readonly hostSessionDir: string;
    private readonly shouldCleanup: boolean;
    private isTerminated: boolean = false;
    private watcherProcess: ChildProcess | null = null;

    static async create(args: RuntimeExecutionEnvironmentOptions): Promise<DockerPrimitive> {
        if (!args.docker) {
            throw new Error("Docker execution environment options required");
        }

        const sessionId = `ai-session-${randomUUID().slice(0, 8)}`;
        const hostSessionDir = path.join(args.docker.sessionsDirectoryPath, sessionId);

        // Create host session directory only - subdirs created by ExecutionEnvironment
        await fs.mkdir(hostSessionDir, { recursive: true });

        // Determine image
        const image = args.docker.image || DEFAULT_IMAGE;
        const needsToolInstall = !args.docker.image;  // Install tools if using default base image

        // Create container
        await createContainer({
            id: sessionId,
            image,
            hostBasePath: hostSessionDir,
            env: args.docker.env,
            resources: args.docker.resources,
        });

        // Install CLI tools if using base image
        if (needsToolInstall) {
            await installTools(sessionId);
        }

        logger.info({ sessionId, hostSessionDir, image }, 'DockerPrimitive created');

        return new DockerPrimitive(sessionId, hostSessionDir, args.docker.shouldCleanup);
    }

    private constructor(
        containerId: string,
        hostSessionDir: string,
        shouldCleanup: boolean
    ) {
        this.containerId = containerId;
        this.hostSessionDir = hostSessionDir;
        this.shouldCleanup = shouldCleanup;
    }

    getId(): string {
        return this.containerId;
    }

    getBasePaths() {
        // Return container session dir - paths derived by ExecutionEnvironment
        return { SESSION_DIR: CONTAINER_SESSION_DIR };
    }

    async exec(command: string[], options?: { cwd?: string }): Promise<ProcessHandle> {
        if (this.isTerminated) {
            throw new Error('DockerPrimitive has been terminated');
        }

        // Default cwd is workspace dir in container
        const containerPaths = deriveSessionPaths(CONTAINER_SESSION_DIR);
        const cwd = options?.cwd || containerPaths.workspaceDir;

        // Build docker exec command
        const dockerArgs = ['exec', '-i', '-w', cwd, this.containerId, ...command];

        const child = spawn('docker', dockerArgs, {
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        return createProcessHandle(child);
    }

    /**
     * Convert container path to host path for file operations.
     * Since we use volume mounts, files can be accessed directly on the host.
     * Container: /session/* -> Host: {hostSessionDir}/*
     */
    private hostPath(containerPath: string): string {
        if (containerPath.startsWith('/session/')) {
            return path.join(this.hostSessionDir, containerPath.slice('/session/'.length));
        }
        if (containerPath === '/session') {
            return this.hostSessionDir;
        }
        // Default: assume it's a relative path under workspace
        return path.join(this.hostSessionDir, 'workspace', containerPath);
    }

    async readFile(filePath: string): Promise<string | null> {
        try {
            const hostFilePath = this.hostPath(filePath);
            const content = await fs.readFile(hostFilePath, 'utf-8');
            return content || null;
        } catch (err: any) {
            if (err.code === 'ENOENT') return null;
            throw err;
        }
    }

    async writeFile(filePath: string, content: string): Promise<void> {
        const hostFilePath = this.hostPath(filePath);
        const directory = path.dirname(hostFilePath);
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(hostFilePath, content, 'utf-8');
    }

    async writeFiles(files: { path: string; content: string | undefined }[]): Promise<WriteFilesResult> {
        const success: { path: string }[] = [];
        const failed: { path: string; error: string }[] = [];

        for (const file of files) {
            if (file.content === undefined) continue;
            try {
                await this.writeFile(file.path, file.content);
                success.push({ path: file.path });
            } catch (err: any) {
                failed.push({ path: file.path, error: err.message });
            }
        }

        return { success, failed };
    }

    async createDirectory(dirPath: string): Promise<void> {
        const hostDirPath = this.hostPath(dirPath);
        await fs.mkdir(hostDirPath, { recursive: true });
    }

    async listFiles(directory: string, pattern?: string): Promise<string[]> {
        try {
            if (pattern) {
                // Use find command inside container
                const result = await this.exec(['find', directory, '-name', pattern]);
                const output = await streamToString(result.stdout);
                await result.wait();
                return output.trim().split('\n').filter(Boolean);
            } else {
                // Use ls inside container
                const result = await this.exec(['ls', '-1', directory]);
                const output = await streamToString(result.stdout);
                await result.wait();
                return output.trim().split('\n').filter(Boolean);
            }
        } catch {
            return [];
        }
    }

    async isRunning(): Promise<boolean> {
        if (this.isTerminated) return false;
        return isContainerRunning(this.containerId);
    }

    async poll(): Promise<number | null> {
        if (this.isTerminated) return 0;
        return isContainerRunning(this.containerId) ? null : 0;
    }

    async watch(
        watchPath: string,
        callback: (event: WatchEvent) => void,
        opts?: { ignorePatterns?: string[] }
    ): Promise<void> {
        // Use chokidar-cli inside the container (matching ModalSandbox pattern)
        const args = ['exec', '-i', this.containerId, 'npx', 'chokidar-cli', `${watchPath}/**/*`, '--polling'];

        if (opts?.ignorePatterns) {
            for (const pattern of opts.ignorePatterns) {
                args.push('-i', `"${pattern}"`);
            }
        }

        const watcherProcess = spawn('docker', args, {
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        this.watcherProcess = watcherProcess;
        logger.info({ watchPath, containerId: this.containerId }, 'Docker file watcher started');

        // Process output exactly like ModalSandbox
        let buffer = '';

        watcherProcess.stdout?.on('data', async (chunk) => {
            buffer += chunk.toString();

            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                const colonIndex = trimmed.indexOf(':');
                if (colonIndex === -1) {
                    logger.warn({ line: trimmed }, 'Unexpected watcher output format');
                    continue;
                }

                const eventType = trimmed.slice(0, colonIndex) as WatchEventType;
                const filePath = trimmed.slice(colonIndex + 1);

                if (!['add', 'change', 'unlink'].includes(eventType)) {
                    logger.debug({ eventType, filePath }, 'Skipping non-file event');
                    continue;
                }

                let relativePath = filePath;
                if (filePath.startsWith(watchPath)) {
                    relativePath = filePath.slice(watchPath.length);
                    if (relativePath.startsWith('/')) {
                        relativePath = relativePath.slice(1);
                    }
                }

                logger.info({ eventType, filePath, relativePath, watchPath }, 'File change detected');

                let content: string | undefined;
                if (eventType !== 'unlink') {
                    try {
                        content = await this.readFile(filePath) ?? undefined;
                    } catch (err) {
                        logger.warn({ filePath, error: err }, 'Failed to read file content');
                    }
                }

                callback({
                    type: eventType,
                    path: relativePath,
                    content,
                });
            }
        });

        watcherProcess.stderr?.on('data', (chunk) => {
            logger.warn({ stderr: chunk.toString() }, 'Watcher stderr');
        });

        watcherProcess.on('error', (err) => {
            logger.error({ error: err }, 'Watch process error');
        });
    }

    async terminate(): Promise<void> {
        if (this.isTerminated) return;

        this.isTerminated = true;

        // Kill watcher process
        if (this.watcherProcess) {
            this.watcherProcess.kill('SIGTERM');
            this.watcherProcess = null;
        }

        // Remove container
        await removeContainer(this.containerId);

        // Cleanup host workspace if configured
        if (this.shouldCleanup) {
            try {
                await fs.rm(this.hostSessionDir, { recursive: true, force: true });
                logger.info({ hostSessionDir: this.hostSessionDir }, 'DockerPrimitive workspace cleaned up');
            } catch (err) {
                logger.warn({ hostSessionDir: this.hostSessionDir, error: err }, 'Failed to cleanup workspace');
            }
        }

        logger.info({ containerId: this.containerId }, 'DockerPrimitive terminated');
    }
}
