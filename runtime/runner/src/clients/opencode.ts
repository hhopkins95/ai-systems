/**
 * OpenCode SDK client with lazy initialization.
 *
 * The client is created on first use and reused across calls.
 */

import type { createOpencode as CreateOpencodeType } from '@opencode-ai/sdk';

type OpencodeResult = Awaited<ReturnType<typeof CreateOpencodeType>>;
type OpencodeClient = OpencodeResult['client'];
type OpencodeServer = OpencodeResult['server'];

export interface OpencodeConnection {
  client: OpencodeClient;
  server: OpencodeServer | undefined;
}

let connectionPromise: Promise<OpencodeConnection> | null = null;

export interface OpencodeClientOptions {
  hostname?: string;
  port?: number;
}

/**
 * Get a shared OpenCode client connection.
 * Creates the connection on first call, reuses on subsequent calls.
 */
export async function getOpencodeConnection(
  options: OpencodeClientOptions = {}
): Promise<OpencodeConnection> {
  if (!connectionPromise) {
    connectionPromise = (async () => {
      // Dynamic import to avoid loading SDK until needed
      const { createOpencode } = await import('@opencode-ai/sdk');

      const result = await createOpencode({
        hostname: options.hostname ?? '127.0.0.1',
        port: options.port ?? 4096,
      });

      return {
        client: result.client,
        server: result.server,
      };
    })();
  }
  return connectionPromise;
}

/**
 * Reset the cached OpenCode connection.
 * Useful for testing or when connection needs to be recreated.
 */
export function resetOpencodeConnection(): void {
  connectionPromise = null;
}

/**
 * Close the OpenCode server if running.
 */
export async function closeOpencodeServer(): Promise<void> {
  if (connectionPromise) {
    const connection = await connectionPromise;
    connection.server?.close();
    connectionPromise = null;
  }
}
