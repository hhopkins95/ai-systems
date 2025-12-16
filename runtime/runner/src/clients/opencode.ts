/**
 * OpenCode SDK client management.
 *
 * Supports two modes:
 * 1. Shared connection (legacy) - cached, tries to reuse existing server
 * 2. Isolated server per request - fresh server with specific config, no caching
 */

import { type createOpencode as CreateOpencodeType, createOpencodeClient} from '@opencode-ai/sdk/v2';
import { writeStreamEvent } from '../cli/shared/output.js';
import { createLogEvent } from '../helpers/create-stream-events.js';

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
  writeStreamEvent(createLogEvent(`Checking for existing OpenCode server at ${baseUrl}`, 'debug'));

  try {
    writeStreamEvent(createLogEvent(`Creating OpenCode client for ${baseUrl}`, 'debug'));
    const client = await createOpencodeClient({ baseUrl });

    writeStreamEvent(createLogEvent('Testing connection with project.list()', 'debug'));
    const result = await client.project.list();

    if (result.error) {
      writeStreamEvent(createLogEvent(`Server responded with error`, 'debug', { error: result.error }));
      return null;
    }

    writeStreamEvent(createLogEvent(`Successfully connected to existing OpenCode server at ${baseUrl}`, 'info'));
    return client;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    writeStreamEvent(createLogEvent(`Failed to connect to existing server: ${msg}`, 'debug'));
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

      writeStreamEvent(createLogEvent(`Attempting OpenCode connection to ${baseUrl}`, 'debug'));

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

        writeStreamEvent(createLogEvent(`Calling createOpencode({ hostname: '${hostname}', port: ${port} })`, 'debug'));
        const result = await createOpencode({
          hostname,
          port,
        });

        writeStreamEvent(createLogEvent('OpenCode server started successfully', 'info'));

        await authenticate(result.client);

        return {
          client: result.client,
          server: result.server,
          close: () => result.server?.close(),
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        writeStreamEvent(createLogEvent(`Failed to start OpenCode server: ${msg}`, 'error'));
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

  writeStreamEvent(createLogEvent(`Creating isolated OpenCode server with config: ${configPath}`, 'debug'));

  try {
    const { createOpencode } = await import('@opencode-ai/sdk/v2');

    const result = await createOpencode({
      hostname: '127.0.0.1',
      port,
    });

    writeStreamEvent(createLogEvent(`Isolated OpenCode server started on port ${result.server?.port}`, 'info'));

    await authenticate(result.client);

    return {
      client: result.client,
      server: result.server,
      close: () => {
        writeStreamEvent(createLogEvent('Closing isolated OpenCode server', 'debug'));
        result.server?.close();
      },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    writeStreamEvent(createLogEvent(`Failed to start isolated OpenCode server: ${msg}`, 'error'));
    throw error;
  }
}
