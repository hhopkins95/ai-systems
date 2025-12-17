/**
 * Generic Agent Runtime - Public API
 *
 * This is the public API for the generic agent runtime.
 * Applications import from this module to use the runtime with their own adapters.
 *
 * @example
 * ```typescript
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
 * // Create REST API and HTTP server
 * const app = runtime.createRestServer({ apiKey: process.env.API_KEY });
 * const httpServer = serve({ fetch: app.fetch, port: 3000 });
 *
 * // Attach WebSocket transport (local host only)
 * runtime.attachTransport?.(httpServer);
 * ```
 */

// ============================================================================
// Runtime Factory
// ============================================================================

export { createAgentRuntime } from './runtime.js';
export type { AgentRuntime, AgentRuntimeConfig } from './runtime.js';

// ============================================================================
// Host Configuration Types
// ============================================================================

export type {
  HostConfig,
  LocalHostConfig,
  DurableObjectHostConfig,
  ClusteredHostConfig,
} from './types/host-config.js';

// ============================================================================
// Core Types
// ============================================================================

export type {
  // Runtime configuration
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

export { createRestServer, errorResponse } from './server/server.js';
export { createSessionRoutes } from './server/routes/sessions.js';
export { createMessageRoutes } from './server/routes/messages.js';

// ============================================================================
// Utilities
// ============================================================================

export { bundleMcpDirectory } from './lib/util/bundle-mcp.js';
