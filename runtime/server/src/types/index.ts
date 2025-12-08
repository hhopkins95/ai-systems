/**
 * Public type exports for the generic agent runtime
 *
 * Applications importing this runtime should use these types
 * to implement adapters and configure the runtime.
 */

// ============================================================================
// Core Adapter Interfaces
// ============================================================================

export type {
  // Persistence (session + storage combined)
  PersistenceAdapter,
} from './persistence-adapter';

// ============================================================================
// Runtime Configuration
// ============================================================================

export type {
  RuntimeConfig,
} from './runtime';

// ============================================================================
// Session Types
// ============================================================================

export type {
  AGENT_ARCHITECTURE_TYPE,
  WorkspaceFile,
  RuntimeSessionData,
  // New types (preferred)
  SandboxStatus,
  SessionRuntimeState,
  SessionListItem,
  PersistedSessionListData,
  CreateSessionArgs,
  PersistedSessionData
} from '@ai-systems/shared-types';

// ============================================================================
// Agent Profile Types
// ============================================================================

export type {
  AgentProfileListData,
  AgentProfile,
} from './agent-profiles';


// ============================================================================
// Event Types (WebSocket)
// ============================================================================

export type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from './events';

