/**
 * Session Module - Session internals and event infrastructure
 *
 * This module provides the foundation for session-as-actor architecture:
 * - AgentSession: Session coordinator (orchestrates all components)
 * - ExecutionEnvironment: Agent code execution abstraction
 * - SessionEventBus: Per-session typed event emitter
 * - SessionState: Event-driven state container using shared reducers
 * - PersistenceListener: Handles storage sync via events
 * - ClientBroadcastListener: Bridges SessionEventBus to ClientHub
 *
 * Together, these components make each session a self-contained unit
 * that can be hosted anywhere (single server, cluster, Durable Objects).
 */

// Session coordinator
export { AgentSession } from './agent-session.js';
export type { OnExecutionEnvironmentTerminatedCallback } from './agent-session.js';

// Execution environment
export { ExecutionEnvironment } from './execution-environment.js';
export type { ExecutionEnvironmentConfig } from './execution-environment.js';

// Core event bus
export { SessionEventBus } from './session-event-bus.js';

// State management
export { SessionState } from './session-state.js';
export type { SessionStateInit } from './session-state.js';

// Event listeners
export { PersistenceListener } from './persistence-listener.js';
export { ClientBroadcastListener } from './client-broadcast-listener.js';
