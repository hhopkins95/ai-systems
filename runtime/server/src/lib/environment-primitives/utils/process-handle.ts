import { ChildProcess } from 'child_process';
import { Readable } from 'stream';
import { nodeStreamToWebStream } from './stream-converter';

export interface ProcessHandle {
    stdout: ReadableStream<string>;
    stderr: ReadableStream<string>;
    stdin: {
        writeText: (text: string) => Promise<void>;
        writeBytes: (data: Uint8Array) => Promise<void>;
        close: () => Promise<void>;
    };
    wait: () => Promise<number>;
}

/**
 * Create a Modal-compatible process handle from a Node.js ChildProcess.
 * Converts Node streams to Web ReadableStreams and wraps stdin.
 */
export function createProcessHandle(child: ChildProcess): ProcessHandle {
    const stdin = {
        writeText: async (text: string): Promise<void> => {
            return new Promise((resolve, reject) => {
                if (!child.stdin) {
                    reject(new Error('stdin not available'));
                    return;
                }
                child.stdin.write(text, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        },
        writeBytes: async (data: Uint8Array): Promise<void> => {
            return new Promise((resolve, reject) => {
                if (!child.stdin) {
                    reject(new Error('stdin not available'));
                    return;
                }
                child.stdin.write(data, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        },
        close: async (): Promise<void> => {
            return new Promise((resolve) => {
                if (!child.stdin) {
                    resolve();
                    return;
                }
                child.stdin.end(() => resolve());
            });
        }
    };

    const waitPromise = new Promise<number>((resolve) => {
        child.on('close', (code) => {
            resolve(code ?? 0);
        });
        child.on('error', () => {
            resolve(1);
        });
    });

    return {
        stdout: nodeStreamToWebStream(child.stdout as Readable),
        stderr: nodeStreamToWebStream(child.stderr as Readable),
        stdin,
        wait: () => waitPromise,
    };
}
