/**
 * Generic Agent Runtime - Public API
 *
 * This is the public API for the generic agent runtime.
 * Applications import from this module to use the runtime with their own adapters.
 *
 * @example
 * ```typescript
 * import { createAgentRuntime, createLocalHost } from '@hhopkins/agent-server';
 *
 * // Create host with transport
 * const host = createLocalHost({
 *   persistence: myPersistenceAdapter,
 *   executionEnvironment: config.executionEnvironment,
 * });
 *
 * // Create runtime
 * const runtime = await createAgentRuntime({
 *   sessionHost: host.sessionHost,
 * });
 *
 * await runtime.start();
 *
 * // Create REST API and HTTP server
 * const app = runtime.createRestServer({ apiKey: process.env.API_KEY });
 * const httpServer = serve({ fetch: app.fetch, port: 3000 });
 *
 * // Attach WebSocket transport
 * host.attachTransport(httpServer);
 * ```
 */

// ============================================================================
// Runtime Factory
// ============================================================================

export { createAgentRuntime } from './runtime.js';
export type { AgentRuntime, AgentRuntimeConfig } from './runtime.js';

// ============================================================================
// Host Factories
// ============================================================================

export {
  createLocalHost,
  LocalSessionHost,
  type LocalHost,
  type LocalHostConfig,
  type TransportOptions,
} from './hosts/index.js';

// ============================================================================
// Core Types
// ============================================================================

export type {
  // Runtime configuration (legacy - may be removed)
  RuntimeConfig,

  // Adapter interfaces
  PersistenceAdapter,

  RuntimeSessionData,
  WorkspaceFile,
  AgentArchitecture,

  // Event types
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,

} from './types/index.js';

// ============================================================================
// Core Interfaces (for advanced use cases)
// ============================================================================

export type { SessionHost } from './core/host/session-host.js';
export type { AgentSession } from './core/session/agent-session.js';

// ============================================================================
// REST Server (for custom setups)
// ============================================================================

export { createRestServer, errorResponse } from './transport/rest/server.js';
export { createSessionRoutes } from './transport/rest/routes/sessions.js';
export { createMessageRoutes } from './transport/rest/routes/messages.js';

// ============================================================================
// Utilities
// ============================================================================

export { bundleMcpDirectory } from './lib/util/bundle-mcp.js';
