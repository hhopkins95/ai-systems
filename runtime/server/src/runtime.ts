/**
 * Runtime factory - creates and configures the agent runtime
 *
 * This is the main entry point for applications using the generic runtime.
 * Applications provide a pre-configured SessionHost and the runtime handles REST API.
 *
 * @example
 * ```typescript
 * import { serve } from "@hono/node-server";
 * import { createAgentRuntime, createLocalHost } from '@hhopkins/agent-server';
 *
 * // Create host (includes transport setup)
 * const host = createLocalHost({
 *   persistence: myPersistenceAdapter,
 *   executionEnvironment: config.executionEnvironment,
 * });
 *
 * // Create runtime with the host
 * const runtime = await createAgentRuntime({
 *   sessionHost: host.sessionHost,
 * });
 *
 * await runtime.start();
 *
 * // Create Hono REST API
 * const app = runtime.createRestServer({ apiKey: process.env.API_KEY });
 *
 * // Create HTTP server and attach transport
 * const httpServer = serve({ fetch: app.fetch, port: 3000 });
 * host.attachTransport(httpServer);
 *
 * console.log('Server running on http://localhost:3000');
 * ```
 */

import type { Hono } from 'hono';
import { logger } from './config/logger.js';
import type { SessionHost } from './core/host/session-host.js';
import { createRestServer } from './transport/rest/server.js';

/**
 * Runtime configuration
 */
export interface AgentRuntimeConfig {
  /** Pre-configured session host */
  sessionHost: SessionHost;
}

/**
 * Agent runtime instance returned by createAgentRuntime
 */
export type AgentRuntime = {
  /** The session host instance */
  sessionHost: SessionHost;

  /**
   * Create a Hono REST API server
   * @param config - REST server configuration
   * @returns Hono application instance
   */
  createRestServer: (config: { apiKey: string }) => Hono;

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
 * @param config - Runtime configuration with sessionHost
 * @returns Initialized runtime instance
 *
 * @example
 * ```typescript
 * const host = createLocalHost({ persistence, executionEnvironment });
 * const runtime = await createAgentRuntime({ sessionHost: host.sessionHost });
 * await runtime.start();
 * ```
 */
export async function createAgentRuntime(
  config: AgentRuntimeConfig
): Promise<AgentRuntime> {
  logger.info('Creating agent runtime...');

  const { sessionHost } = config;

  // Return runtime instance
  const runtime: AgentRuntime = {
    sessionHost,

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
