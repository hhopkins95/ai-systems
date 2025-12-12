/**
 * OpenCode SDK client with lazy initialization.
 *
 * The client is created on first use and reused across calls.
 * For local execution, tries to connect to existing server first
 * before starting a new one.
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
 * Check if an OpenCode server is already running by trying to connect.
 */
async function tryConnectExisting(baseUrl: string): Promise<OpencodeClient | null> {
  try {
    const { createOpencodeClient } = await import('@opencode-ai/sdk');
    const client = createOpencodeClient({ baseUrl });

    // Try a simple request to verify server is running
    const result = await client.project.list();
    if (result.error) {
      return null;
    }
    return client;
  } catch {
    return null;
  }
}

/**
 * Get a shared OpenCode client connection.
 * First tries to connect to an existing server (for local multi-session support).
 * If no server is running, starts a new one.
 */
export async function getOpencodeConnection(
  options: OpencodeClientOptions = {}
): Promise<OpencodeConnection> {
  if (!connectionPromise) {
    connectionPromise = (async () => {
      const hostname = options.hostname ?? '127.0.0.1';
      const port = options.port ?? 4096;
      const baseUrl = `http://${hostname}:${port}`;

      // First, try to connect to an existing server
      const existingClient = await tryConnectExisting(baseUrl);
      if (existingClient) {
        console.log(`[opencode] Connected to existing server at ${baseUrl}`);
        return {
          client: existingClient,
          server: undefined, // We didn't start this server, so don't track it
        };
      }

      // No existing server, start a new one
      console.log(`[opencode] Starting new server at ${baseUrl}`);
      const { createOpencode } = await import('@opencode-ai/sdk');

      const result = await createOpencode({
        hostname,
        port,
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
