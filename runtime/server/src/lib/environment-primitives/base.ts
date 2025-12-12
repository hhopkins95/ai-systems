import { join } from 'path';

export interface WriteFilesResult {
    success: { path: string }[];
    failed: { path: string; error: string }[];
}

export type WatchEventType = 'add' | 'change' | 'unlink';

export interface WatchEvent {
    type: WatchEventType;
    path: string;
    content?: string;  // present for 'add' and 'change', undefined for 'unlink'
}

/**
 * Paths derived from a session directory root.
 * All session-related files live within SESSION_DIR using these conventions.
 */
export interface SessionPaths {
    /** Root of the session folder */
    sessionDir: string;
    /** Runner bundle (runner.js, package.json, adapter) */
    appDir: string;
    /** Working directory for the session */
    workspaceDir: string;
    /** Bundled MCP servers */
    mcpDir: string;
    /** Claude config directory (set as CLAUDE_CONFIG_DIR) */
    claudeConfigDir: string;
}

/**
 * Derive all session paths from the session root directory.
 * This enforces the convention: one session = one folder = one source of truth.
 */
export function deriveSessionPaths(sessionDir: string): SessionPaths {
    return {
        sessionDir,
        appDir: join(sessionDir, 'app'),
        workspaceDir: join(sessionDir, 'workspace'),
        mcpDir: join(sessionDir, 'mcps'),
        claudeConfigDir: join(sessionDir, '.claude'),
    };
}

/**
 * Primitives for basic file system operations for the execution environment.
 */
export interface EnvironmentPrimitive {

    getId : () => string,

    /**
     * Returns the root session directory. All other paths are derived from this
     * using deriveSessionPaths() convention.
     */
    getBasePaths : () => {
        SESSION_DIR: string;
    }

    exec : (command : string[], options? : {cwd? : string}) => Promise<{
        stdout : ReadableStream,
        stderr : ReadableStream,
        stdin: {
            writeText: (text: string) => Promise<void>;
            writeBytes: (data: Uint8Array) => Promise<void>;
            close: () => Promise<void>;
        },
        wait : () => Promise<number>
    }>,

    readFile : (path : string) => Promise<string | null>,

    writeFile : (path : string, content : string) => Promise<void>,

    /**
     * Write multiple files in a single operation (bulk write for efficiency).
     * Creates directories as needed. Returns partial success - writes what it can.
     */
    writeFiles : (files : { path: string; content: string | undefined }[]) => Promise<WriteFilesResult>,

    createDirectory : (path : string) => Promise<void>,

    listFiles : (path : string, pattern? : string) => Promise<string[]>,

    isRunning : () => Promise<boolean>,

    /**
     * Poll the sandbox to check if it's still running
     * @returns null if running, exit code (number) if exited
     */
    poll : () => Promise<number | null>,

    terminate : () => Promise<void>,

    /**
     * Watch a directory for file changes.
     * Callback is invoked for each file change event.
     * Promise resolves when watcher is ready.
     * Cleanup is automatic on terminate().
     *
     * @param path - Directory path to watch
     * @param callback - Function called for each file change event
     */
    watch : (path: string, callback: (event: WatchEvent) => void, opts? : {
        ignorePatterns? : string[],
    }) => Promise<void>,

}