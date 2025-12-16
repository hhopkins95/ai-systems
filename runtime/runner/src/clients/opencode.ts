/**
 * OpenCode SDK client with lazy initialization.
 *
 * The client is created on first use and reused across calls.
 * For local execution, tries to connect to existing server first
 * before starting a new one.
 */

import { type createOpencode as CreateOpencodeType, createOpencodeClient} from '@opencode-ai/sdk';
import { writeStreamEvent } from '../cli/shared/output.js';
import { createLogEvent } from '../helpers/create-stream-events.js';

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
        return {
          client: existingClient,
          server: undefined, // We didn't start this server, so don't track it
        };
      }

      // No existing server, start a new one
      writeStreamEvent(createLogEvent(`No existing server found, starting new OpenCode server at ${baseUrl}`, 'info'));

      try {
        const { createOpencode } = await import('@opencode-ai/sdk');

        writeStreamEvent(createLogEvent(`Calling createOpencode({ hostname: '${hostname}', port: ${port} })`, 'debug'));
        const result = await createOpencode({
          hostname,
          port,
        });

        writeStreamEvent(createLogEvent('OpenCode server started successfully', 'info'));
        return {
          client: result.client,
          server: result.server,
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
