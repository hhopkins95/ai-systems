/**
 * Session Module - Per-session event infrastructure
 *
 * This module provides the foundation for session-as-actor architecture:
 * - SessionEventBus: Per-session typed event emitter
 * - SessionState: Serializable state container with snapshot/restore
 * - ClientHub: Interface for broadcasting to connected clients
 * - PersistenceListener: Handles storage sync via events
 * - ClientBroadcastListener: Bridges SessionEventBus to ClientHub
 *
 * Together, these components make each session a self-contained unit
 * that can be hosted anywhere (single server, cluster, Durable Objects).
 */

// Core event bus
export { SessionEventBus } from './session-event-bus.js';
export type { SessionEvents } from './session-event-bus.js';

// State management
export { SessionState } from './session-state.js';
export type { SessionStateSnapshot } from './session-state.js';

// Client communication
export { MockClientHub } from './client-hub.js';
export type { ClientHub, ClientHubEvents } from './client-hub.js';

// Event listeners
export { PersistenceListener } from './persistence-listener.js';
export { ClientBroadcastListener } from './client-broadcast-listener.js';
