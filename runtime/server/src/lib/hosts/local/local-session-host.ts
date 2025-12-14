/**
 * LocalSessionHost - In-memory session hosting
 *
 * Manages session lifecycle for single-server deployments.
 * Sessions are stored in an in-memory Map.
 *
 * This is the default implementation of SessionHost, extracted from
 * the original SessionManager. It removes the global EventBus dependency
 * since session lists are now REST-only (no WebSocket broadcast).
 */

import { logger } from '../../../config/logger.js';
import type { PersistenceAdapter } from '../../../types/persistence-adapter.js';
import type { RuntimeConfig } from '../../../types/runtime.js';
import type { CreateSessionArgs } from '@ai-systems/shared-types';
import { AgentSession } from '../../../core/session/agent-session.js';
import type { ClientHub } from '../../../core/host/client-hub.js';
import { MockClientHub } from '../../../core/host/client-hub.js';
import type { SessionHost } from '../../../core/host/session-host.js';

/**
 * LocalSessionHost - In-memory session hosting for single-server deployments
 */
export class LocalSessionHost implements SessionHost {
  // Loaded sessions (in-memory, may or may not have active sandbox)
  private loadedSessions: Map<string, AgentSession> = new Map();

  // Dependencies
  private clientHub: ClientHub;
  private readonly executionConfig: RuntimeConfig['executionEnvironment'];
  private readonly persistence: PersistenceAdapter;

  constructor(
    executionConfig: RuntimeConfig['executionEnvironment'],
    persistence: PersistenceAdapter,
    clientHub?: ClientHub,
  ) {
    this.executionConfig = executionConfig;
    this.persistence = persistence;
    // Use provided clientHub or create a mock one
    // The real clientHub is typically set via setClientHub after WebSocket server is created
    this.clientHub = clientHub ?? new MockClientHub();
    logger.info('LocalSessionHost initialized');
  }

  /**
   * Set the ClientHub for broadcasting events to connected clients
   * Called after WebSocket server is created
   */
  setClientHub(clientHub: ClientHub): void {
    this.clientHub = clientHub;
    logger.info('ClientHub updated on LocalSessionHost');
  }

  /**
   * Get the current ClientHub
   */
  getClientHub(): ClientHub {
    return this.clientHub;
  }

  // ==========================================================================
  // Session Lifecycle Operations (SessionHost interface)
  // ==========================================================================

  /**
   * Get loaded session by ID
   */
  getSession(sessionId: string): AgentSession | undefined {
    return this.loadedSessions.get(sessionId);
  }

  /**
   * Create a new session
   */
  async createSession(request: CreateSessionArgs): Promise<AgentSession> {
    try {
      logger.info({ request }, 'Creating new session...');

      // Create and initialize new AgentSession using static factory
      const session = await AgentSession.create(
        {
          agentProfileRef: request.agentProfileRef,
          architecture: request.architecture,
          sessionOptions: request.sessionOptions ?? {},
        },
        this.persistence,
        this.executionConfig,
        this.clientHub,
        this.handleEETerminated.bind(this),
      );

      // Add to loaded sessions
      this.loadedSessions.set(session.sessionId, session);

      logger.info(
        { sessionId: session.sessionId, loadedCount: this.loadedSessions.size },
        'Session created successfully'
      );

      // No global event emission - clients use REST to get session list

      return session;
    } catch (error) {
      logger.error({ error, request }, 'Failed to create session');
      throw error;
    }
  }

  /**
   * Load existing session from persistence.
   * Returns existing session if already loaded (per interface contract).
   */
  async loadSession(sessionId: string): Promise<AgentSession> {
    try {
      // Return existing if already loaded
      const existing = this.loadedSessions.get(sessionId);
      if (existing) {
        logger.debug({ sessionId }, 'Session already loaded, returning existing');
        return existing;
      }

      logger.info({ sessionId }, 'Loading session from persistence...');

      // Create AgentSession instance using static factory (loads from persistence internally)
      const session = await AgentSession.create(
        { sessionId },
        this.persistence,
        this.executionConfig,
        this.clientHub,
        this.handleEETerminated.bind(this),
      );

      // Add to loaded sessions
      this.loadedSessions.set(sessionId, session);

      logger.info(
        { sessionId, loadedCount: this.loadedSessions.size },
        'Session loaded successfully'
      );

      // No global event emission - clients use REST to get session list

      return session;
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to load session');
      throw error;
    }
  }

  /**
   * Unload session and cleanup (sync to persistence, terminate sandbox, remove from memory)
   */
  async unloadSession(sessionId: string): Promise<void> {
    const session = this.loadedSessions.get(sessionId);
    if (!session) {
      logger.warn({ sessionId }, 'Session not found for unloading');
      return;
    }

    try {
      logger.info({ sessionId }, 'Unloading session...');

      // Destroy session (includes sync and sandbox termination)
      await session.destroy();

      // Remove from loaded sessions
      this.loadedSessions.delete(sessionId);

      logger.info({ sessionId, loadedCount: this.loadedSessions.size }, 'Session unloaded');

      // Broadcast status update via ClientHub (session is now unloaded)
      // This is a per-session event, not a global broadcast
      this.clientHub.broadcast(sessionId, 'session:status', {
        sessionId,
        runtime: { isLoaded: false, executionEnvironment: null },
      });

      // No global event emission - clients use REST to get session list
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to unload session');
      // Remove from map even if unloading failed
      this.loadedSessions.delete(sessionId);
      throw error;
    }
  }

  /**
   * Check if session is loaded in memory
   */
  isSessionLoaded(sessionId: string): boolean {
    return this.loadedSessions.has(sessionId);
  }

  /**
   * Get all loaded session IDs
   */
  getLoadedSessionIds(): string[] {
    return Array.from(this.loadedSessions.keys());
  }

  /**
   * Graceful shutdown - unload all sessions
   */
  async shutdown(): Promise<void> {
    logger.info({ loadedCount: this.loadedSessions.size }, 'Shutting down LocalSessionHost...');

    // Unload all loaded sessions
    const sessionIds = Array.from(this.loadedSessions.keys());
    for (const sessionId of sessionIds) {
      try {
        await this.unloadSession(sessionId);
      } catch (error) {
        logger.error({ error, sessionId }, 'Failed to unload session during shutdown');
      }
    }

    logger.info('LocalSessionHost shutdown complete');
  }

  // ==========================================================================
  // Additional Methods (not in SessionHost interface)
  // ==========================================================================

  /**
   * Get all sessions from persistence, enriched with runtime state
   * Used by REST endpoint to list all sessions
   */
  async getAllSessions(): Promise<Array<{
    sessionId: string;
    runtime: { isLoaded: boolean; executionEnvironment: unknown };
    [key: string]: unknown;
  }>> {
    try {
      const persisted = await this.persistence.listAllSessions();

      // Enrich with runtime state
      const sessions = persisted.map(session => ({
        ...session,
        runtime: this.getRuntimeState(session.sessionId),
      }));

      logger.debug({ sessionCount: sessions.length }, 'Fetched all sessions from persistence');

      return sessions;
    } catch (error) {
      logger.error({ error }, 'Failed to get all sessions from persistence');
      // Fallback to loaded sessions only
      return this.getLoadedSessionsAsListItems();
    }
  }

  /**
   * Get runtime state for a session
   */
  private getRuntimeState(sessionId: string): { isLoaded: boolean; executionEnvironment: unknown } {
    const session = this.loadedSessions.get(sessionId);
    if (!session) {
      return { isLoaded: false, executionEnvironment: null };
    }
    return session.getRuntimeState();
  }

  /**
   * Get loaded session count
   */
  getLoadedSessionCount(): number {
    return this.loadedSessions.size;
  }

  /**
   * Get all loaded sessions
   */
  getLoadedSessions(): AgentSession[] {
    return Array.from(this.loadedSessions.values());
  }

  /**
   * Get loaded sessions as list items (with runtime state)
   */
  private getLoadedSessionsAsListItems(): Array<{
    sessionId: string;
    runtime: { isLoaded: boolean; executionEnvironment: unknown };
    [key: string]: unknown;
  }> {
    return this.getLoadedSessions().map((session) => ({
      ...session.getPersistedListData(),
      runtime: session.getRuntimeState(),
    }));
  }

  /**
   * Handle sandbox termination callback from AgentSession
   * Called when Modal terminates the sandbox (idle timeout)
   */
  private handleEETerminated(sessionId: string): void {
    logger.info({ sessionId }, 'Sandbox terminated, unloading session...');
    // Use setImmediate to avoid blocking the health check callback
    setImmediate(async () => {
      try {
        await this.unloadSession(sessionId);
      } catch (error) {
        logger.error({ error, sessionId }, 'Failed to unload session after sandbox termination');
      }
    });
  }

  // ==========================================================================
  // Health Check
  // ==========================================================================

  /**
   * Check if LocalSessionHost is healthy
   */
  isHealthy(): boolean {
    return true;
  }
}
