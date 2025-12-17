/**
 * Runtime factory - creates and configures the agent runtime
 *
 * This is the main entry point for applications using the generic runtime.
 * The runtime creates the appropriate session host internally based on host configuration.
 *
 * @example
 * ```typescript
 * import { serve } from "@hono/node-server";
 * import { createAgentRuntime } from '@hhopkins/agent-server';
 *
 * // Create runtime with full config
 * const runtime = await createAgentRuntime({
 *   persistence: myPersistenceAdapter,
 *   executionEnvironment: { type: 'modal', modal: {...} },
 *   host: { type: 'local' }
 * });
 *
 * await runtime.start();
 *
 * // Create Hono REST API
 * const app = runtime.createRestServer({ apiKey: process.env.API_KEY });
 *
 * // Create HTTP server and attach transport (local host only)
 * const httpServer = serve({ fetch: app.fetch, port: 3000 });
 * const io = runtime.attachTransport?.(httpServer);
 *
 * console.log('Server running on http://localhost:3000');
 * ```
 */

import type { Server as HTTPServer } from 'http';
import type { Hono } from 'hono';
import { logger } from './config/logger.js';
import type { SessionHost } from './core/host/session-host.js';
import type { PersistenceAdapter } from './types/persistence-adapter.js';
import type { AgentRuntimeConfig } from './types/runtime.js';
import type { LocalHostConfig } from './types/host-config.js';
import { createRestServer } from './server/server.js';
import {
  LocalSessionHost,
  attachLocalTransport,
  type SocketIOServerInstance,
} from './lib/hosts/local/index.js';

/**
 * Agent runtime instance returned by createAgentRuntime
 */
export type AgentRuntime = {
  /** The session host instance */
  sessionHost: SessionHost;

  /** Direct access to persistence adapter */
  persistence: PersistenceAdapter;

  /**
   * Create a Hono REST API server
   * @param config - REST server configuration
   * @returns Hono application instance
   */
  createRestServer: (config: { apiKey: string }) => Hono;

  /**
   * Attach transport to HTTP server (local host only).
   * Returns Socket.IO server instance.
   * Undefined for non-local hosts.
   */
  attachTransport?: (httpServer: HTTPServer) => SocketIOServerInstance;

  /** Start the runtime */
  start: () => Promise<void>;

  /** Shutdown the runtime gracefully */
  shutdown: () => Promise<void>;

  /** Check if the runtime is healthy */
  isHealthy: () => boolean;
};

/**
 * Create and initialize the agent runtime
 *
 * The runtime creates the appropriate session host internally based on host.type.
 *
 * @param config - Runtime configuration
 * @returns Initialized runtime instance
 *
 * @example
 * ```typescript
 * const runtime = await createAgentRuntime({
 *   persistence: myPersistenceAdapter,
 *   executionEnvironment: { type: 'modal', modal: {...} },
 *   host: { type: 'local' }
 * });
 * await runtime.start();
 * ```
 */
export async function createAgentRuntime(
  config: AgentRuntimeConfig
): Promise<AgentRuntime> {
  logger.info('Creating agent runtime...');

  const { persistence, executionEnvironment, host: hostConfig } = config;

  // Create host based on type
  let sessionHost: SessionHost;
  let attachTransport: AgentRuntime['attachTransport'];

  switch (hostConfig.type) {
    case 'local': {
      logger.info('Creating LocalSessionHost...');
      const localHost = new LocalSessionHost(executionEnvironment, persistence);
      sessionHost = localHost;

      // Capture host config for transport attachment
      const localHostConfig = hostConfig as LocalHostConfig;

      // Provide attachTransport function for local host
      attachTransport = (httpServer: HTTPServer) => {
        return attachLocalTransport(localHost, httpServer, localHostConfig);
      };

      logger.info('LocalSessionHost created');
      break;
    }

    case 'durable-object':
      throw new Error('Durable Object host not yet implemented');

    case 'clustered':
      throw new Error('Clustered host not yet implemented');

    default:
      throw new Error(`Unknown host type: ${(hostConfig as { type: string }).type}`);
  }

  // Return runtime instance
  const runtime: AgentRuntime = {
    sessionHost,
    persistence,
    attachTransport,

    createRestServer(restConfig: { apiKey: string }) {
      const restServer = createRestServer({
        sessionHost,
        config: restConfig,
      });
      logger.info('REST server created');
      return restServer;
    },

    async start(): Promise<void> {
      logger.info('Starting agent runtime...');
      logger.info('Agent runtime started successfully');
    },

    async shutdown(): Promise<void> {
      logger.info('Shutting down agent runtime...');

      // Gracefully shutdown SessionHost (sync all sessions, terminate sandboxes)
      await sessionHost.shutdown();

      logger.info('Agent runtime shutdown complete');
    },

    isHealthy(): boolean {
      return sessionHost.isHealthy();
    },
  };

  logger.info('Agent runtime created successfully');

  return runtime;
}

// Re-export the AgentRuntimeConfig type from types for convenience
export type { AgentRuntimeConfig } from './types/runtime.js';
