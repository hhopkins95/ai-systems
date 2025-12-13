/**
 * SessionHost Interface - Abstracts where sessions live and how they're located
 *
 * This interface enables different deployment strategies:
 * - LocalSessionHost: In-memory Map (current implementation)
 * - DurableObjectSessionHost: Cloudflare Durable Objects (future)
 * - ClusteredSessionHost: Redis-coordinated cluster (future)
 *
 * Note: SessionHost is about WHERE the AgentSession coordinator lives.
 * It is NOT about where agent code executes - that's ExecutionEnvironment.
 */

import type { AgentSession } from '../agent-session.js';
import type { CreateSessionArgs } from '@ai-systems/shared-types';
import type { ClientHub } from './client-hub.js';

/**
 * SessionHost - Manages session lifecycle and location
 */
export interface SessionHost {
  /** Get a loaded session (undefined if not loaded) */
  getSession(sessionId: string): AgentSession | undefined;

  /** Create a new session */
  createSession(args: CreateSessionArgs): Promise<AgentSession>;

  /** Load existing session from persistence. Returns existing if already loaded. */
  loadSession(sessionId: string): Promise<AgentSession>;

  /** Unload session (sync to persistence, cleanup) */
  unloadSession(sessionId: string): Promise<void>;

  /** Check if session is loaded */
  isSessionLoaded(sessionId: string): boolean;

  /** Get all loaded session IDs */
  getLoadedSessionIds(): string[];

  /** Graceful shutdown */
  shutdown(): Promise<void>;

  /** Set the ClientHub for session event broadcasting */
  setClientHub(clientHub: ClientHub): void;
}
