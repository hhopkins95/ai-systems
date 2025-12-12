import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import chokidar, { type FSWatcher } from 'chokidar';
import { randomUUID } from 'crypto';
import { logger } from '../../../config/logger';
import { RuntimeExecutionEnvironmentOptions } from '../../../types/runtime';
import { EnvironmentPrimitive, WatchEvent, WatchEventType, WriteFilesResult } from '../base';
import { createProcessHandle, ProcessHandle } from '../utils/process-handle';
import { streamToString } from '../utils/stream-converter';


export class LocalPrimitive implements EnvironmentPrimitive {

    private readonly id: string;
    private readonly sessionPath: string;
    private readonly basePaths: {
        APP_DIR: string;
        WORKSPACE_DIR: string;
        HOME_DIR: string;
        BUNDLED_MCP_DIR: string;
    };
    private readonly shouldCleanup: boolean;
    private isTerminated: boolean = false;
    private watchers: FSWatcher[] = [];
    private runningProcesses: ChildProcess[] = [];

    static async create(args: RuntimeExecutionEnvironmentOptions): Promise<LocalPrimitive> {
        if (!args.local) {
            throw new Error("Local execution environment options required");
        }

        const sessionId = randomUUID();
        const sessionPath = path.join(args.local.sessionsDirectoryPath, sessionId);

        // Create session directories
        const basePaths = {
            APP_DIR: path.join(sessionPath, 'app'),
            WORKSPACE_DIR: path.join(sessionPath, 'workspace'),
            HOME_DIR: path.join(sessionPath, 'home'),
            BUNDLED_MCP_DIR: path.join(sessionPath, 'mcps'),
        };

        for (const dir of Object.values(basePaths)) {
            await fs.mkdir(dir, { recursive: true });
        }

        logger.info({ sessionId, sessionPath }, 'LocalPrimitive created');

        return new LocalPrimitive(sessionId, sessionPath, basePaths, args.local.shouldCleanup);
    }

    private constructor(
        id: string,
        sessionPath: string,
        basePaths: typeof LocalPrimitive.prototype.basePaths,
        shouldCleanup: boolean
    ) {
        this.id = id;
        this.sessionPath = sessionPath;
        this.basePaths = basePaths;
        this.shouldCleanup = shouldCleanup;
    }

    getId(): string {
        return this.id;
    }

    getBasePaths() {
        return this.basePaths;
    }

    async exec(command: string[], options?: { cwd?: string }): Promise<ProcessHandle> {
        if (this.isTerminated) {
            throw new Error('LocalPrimitive has been terminated');
        }

        if (command.length === 0) {
            throw new Error('Command array must not be empty');
        }

        const cmd = command[0]!;
        const args = command.slice(1);
        const cwd = options?.cwd || this.basePaths.WORKSPACE_DIR;

        const child: ChildProcess = spawn(cmd, args, {
            cwd,
            env: {
                ...process.env,
                HOME: this.basePaths.HOME_DIR,
            },
        });

        this.runningProcesses.push(child);

        // Remove from running processes when done
        child.once('close', () => {
            this.runningProcesses = this.runningProcesses.filter(p => p !== child);
        });

        return createProcessHandle(child);
    }

    async readFile(filePath: string): Promise<string | null> {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            return content || null;
        } catch (err: any) {
            if (err.code === 'ENOENT') return null;
            throw err;
        }
    }

    async writeFile(filePath: string, content: string): Promise<void> {
        const directory = path.dirname(filePath);
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(filePath, content, 'utf-8');
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
        await fs.mkdir(dirPath, { recursive: true });
    }

    async listFiles(directory: string, pattern?: string): Promise<string[]> {
        try {
            if (pattern) {
                // Use find command for pattern matching
                const result = await this.exec(['find', directory, '-name', pattern]);
                const output = await streamToString(result.stdout);
                await result.wait();
                return output.trim().split('\n').filter(Boolean);
            } else {
                const entries = await fs.readdir(directory);
                return entries;
            }
        } catch {
            return [];
        }
    }

    async isRunning(): Promise<boolean> {
        return !this.isTerminated;
    }

    async poll(): Promise<number | null> {
        return this.isTerminated ? 0 : null;
    }

    async watch(
        watchPath: string,
        callback: (event: WatchEvent) => void,
        opts?: { ignorePatterns?: string[] }
    ): Promise<void> {
        const watcher = chokidar.watch(`${watchPath}/**/*`, {
            ignored: opts?.ignorePatterns ?? [],
            persistent: true,
            usePolling: false,  // Native events work on host
            ignoreInitial: true,
        });

        this.watchers.push(watcher);

        const handleEvent = async (eventType: WatchEventType, filePath: string) => {
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
        };

        watcher
            .on('add', (path) => handleEvent('add', path))
            .on('change', (path) => handleEvent('change', path))
            .on('unlink', (path) => handleEvent('unlink', path));

        logger.info({ watchPath }, 'Local file watcher started');
    }

    async terminate(): Promise<void> {
        if (this.isTerminated) return;

        this.isTerminated = true;

        // Close all watchers
        for (const watcher of this.watchers) {
            await watcher.close();
        }
        this.watchers = [];

        // Kill all running processes
        for (const proc of this.runningProcesses) {
            proc.kill('SIGTERM');
        }
        this.runningProcesses = [];

        // Cleanup workspace if configured
        if (this.shouldCleanup) {
            try {
                await fs.rm(this.sessionPath, { recursive: true, force: true });
                logger.info({ sessionPath: this.sessionPath }, 'LocalPrimitive workspace cleaned up');
            } catch (err) {
                logger.warn({ sessionPath: this.sessionPath, error: err }, 'Failed to cleanup workspace');
            }
        }

        logger.info({ id: this.id }, 'LocalPrimitive terminated');
    }
}
