/**
 * OpenCode SDK client management.
 *
 * Supports two modes:
 * 1. Shared connection (legacy) - cached, tries to reuse existing server
 * 2. Isolated server per request - fresh server with specific config, no caching
 */

import { type createOpencode as CreateOpencodeType, createOpencodeClient} from '@opencode-ai/sdk/v2';
import { emitLog } from '../cli/shared/output.js';

type OpencodeResult = Awaited<ReturnType<typeof CreateOpencodeType>>;
type OpencodeClient = OpencodeResult['client'];
type OpencodeServer = OpencodeResult['server'];

export interface OpencodeConnection {
  client: OpencodeClient;
  server: OpencodeServer | undefined;
  /** Close the server when done (for isolated servers) */
  close: () => void;
}

let connectionPromise: Promise<OpencodeConnection> | null = null;

export interface OpencodeClientOptions {
  hostname?: string;
  port?: number;
}

export interface IsolatedServerOptions {
  /** Path to opencode.json config file */
  configPath: string;
  /** Port for the server (defaults to random available port via 0) */
  port?: number;
}

/**
 * Check if an OpenCode server is already running by trying to connect.
 */
async function tryConnectExisting(baseUrl: string): Promise<OpencodeClient | null> {
  emitLog('debug', `Checking for existing OpenCode server at ${baseUrl}`);

  try {
    emitLog('debug', `Creating OpenCode client for ${baseUrl}`);
    const client = await createOpencodeClient({ baseUrl });

    emitLog('debug', 'Testing connection with project.list()');
    const result = await client.project.list();

    if (result.error) {
      emitLog('debug', 'Server responded with error', { error: result.error });
      return null;
    }

    emitLog('info', `Successfully connected to existing OpenCode server at ${baseUrl}`);
    return client;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    emitLog('debug', `Failed to connect to existing server: ${msg}`);
    return null;
  }
}

async function authenticate(client: OpencodeClient): Promise<void> {
    await client.auth.set({
      providerID: "zen",
      auth: {
        type: "api",
        key: process.env.OPENCODE_API_KEY || "",
      },
    })
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

      emitLog('debug', `Attempting OpenCode connection to ${baseUrl}`);

      // First, try to connect to an existing server
      const existingClient = await tryConnectExisting(baseUrl);
      if (existingClient) {

        await authenticate(existingClient);

        return {
          client: existingClient,
          server: undefined, // We didn't start this server, so don't track it
          close: () => {}, // No-op for existing servers
        };
      }



      try {
        const { createOpencode } = await import('@opencode-ai/sdk/v2');

        emitLog('debug', `Calling createOpencode({ hostname: '${hostname}', port: ${port} })`);
        const result = await createOpencode({
          hostname,
          port,
        });

        emitLog('info', 'OpenCode server started successfully');

        await authenticate(result.client);

        return {
          client: result.client,
          server: result.server,
          close: () => result.server?.close(),
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        emitLog('error', `Failed to start OpenCode server: ${msg}`);
        throw error;
      }
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

/**
 * Create an isolated OpenCode server with specific config.
 *
 * This starts a fresh server with the given config file, without caching.
 * The server should be closed when done using connection.close().
 *
 * Use this for test isolation or when you need specific config per request.
 */
export async function createIsolatedServer(
  options: IsolatedServerOptions
): Promise<OpencodeConnection> {
  const { configPath, port = 0 } = options;

  // Set config env var before starting server - server subprocess inherits it
  process.env.OPENCODE_CONFIG = configPath;

  emitLog('debug', `Creating isolated OpenCode server with config: ${configPath}`);

  try {
    const { createOpencode } = await import('@opencode-ai/sdk/v2');

    const result = await createOpencode({
      hostname: '127.0.0.1',
      port,
    });

    emitLog('info', `Isolated OpenCode server started at ${result.server?.url}`);

    await authenticate(result.client);

    return {
      client: result.client,
      server: result.server,
      close: () => {
        emitLog('debug', 'Closing isolated OpenCode server');
        result.server?.close();
      },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    emitLog('error', `Failed to start isolated OpenCode server: ${msg}`);
    throw error;
  }
}
