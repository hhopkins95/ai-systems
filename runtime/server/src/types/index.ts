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

// export type {
//   AgentArchitecture,
//   WorkspaceFile,
//   RuntimeSessionData,
//   // New types (preferred)
//   SandboxStatus,
//   SessionRuntimeState,
//   SessionListItem,
//   PersistedSessionListData,
//   CreateSessionArgs,
//   PersistedSessionData, 
//   AgentProfile, 
//   AgentProfileListData, 

// } from '@ai-systems/shared-types';

export * from '@ai-systems/shared-types';


// ============================================================================
// Event Types (WebSocket)
// ============================================================================

export type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from './events';

