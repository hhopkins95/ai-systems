/**
 * Host Module - Session hosting primitives
 *
 * This module provides the core interfaces for session hosting:
 * - SessionHost: Interface for session lifecycle management
 * - ClientHub: Interface for broadcasting events to connected clients
 *
 * For creating a runtime with session hosting, use createAgentRuntime() from the main module.
 *
 * Note: SessionHost is about where the AgentSession coordinator lives.
 * It is NOT about where agent code executes - that's ExecutionEnvironment.
 */

// Session hosting interface
export type { SessionHost } from './session-host.js';

// Client communication interface (internal to hosts)
export { MockClientHub } from './client-hub.js';
export type { ClientHub } from './client-hub.js';
