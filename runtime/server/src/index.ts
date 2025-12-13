/**
 *  Generic Agent Runtime - Public API
 *
 * This is the public API for the generic agent runtime.
 * Applications import from this module to use the runtime with their own adapters.
 *
 * @example
 * ```typescript
 * import { createAgentRuntime } from './src';
 * import type { RuntimeConfig, AgentRuntime } from './src';
 *
 * const runtime = await createAgentRuntime({
 *   persistence: new MyPersistenceAdapter(),
 *   profileLoader: new MyProfileLoader(),
 *   sandboxConfig: new MySandboxConfig(),
 * 
 *   modal: { ... },
 * });
 * ```
 */

// ============================================================================
// Runtime Factory
// ============================================================================

export { createAgentRuntime } from './runtime.js';

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

  // Agent profile types
  // Event types
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,

} from './types/index.js';

// ============================================================================
// Core Components (for advanced use cases)
// ============================================================================

export type { SessionHost } from './core/session/session-host.js';
export { LocalSessionHost } from './core/session/local-session-host.js';
export type { AgentSession } from './core/agent-session.js';

// ============================================================================
// Transport Layer (REST & WebSocket)
// ============================================================================

export { createRestServer, errorResponse } from './transport/rest/server.js';
export { createSessionRoutes } from './transport/rest/routes/sessions.js';
export { createMessageRoutes } from './transport/rest/routes/messages.js';

// ============================================================================
// Utilities
// ============================================================================

export { bundleMcpDirectory } from './lib/util/bundle-mcp.js';
