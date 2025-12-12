/**
 * SessionManager - Container orchestrating all agent sessions
 *
 * Responsibilities:
 * - Fetch all sessions from persistence (enriched with runtime state)
 * - Create new AgentSession instances
 * - Load existing AgentSession from persistence
 * - Unload AgentSession instances (triggered by sandbox termination)
 * - Emit global events to GlobalEventBus (sessions:changed)
 *
 * Note: Session-scoped events are handled by each AgentSession's own
 * SessionEventBus → ClientBroadcastListener → ClientHub flow.
 *
 * Note: Idle timeout is handled by Modal - when sandbox terminates,
 * the AgentSession notifies us via callback to unload the session.
 */

import { logger } from '../config/logger.js';
import type { PersistenceAdapter } from '../types/persistence-adapter.js';
import type { RuntimeConfig } from '../types/runtime.js';
import type {
  CreateSessionArgs,
  SessionListItem,
  SessionRuntimeState
} from '@ai-systems/shared-types';
import { AgentSession } from './agent-session.js';
import type { EventBus } from './event-bus.js';
import type { ClientHub } from './session/client-hub.js';
import { MockClientHub } from './session/client-hub.js';

/**
 * SessionManager - Container for all agent sessions
 *
 * Uses dependency injection pattern for all external dependencies
 */
export class SessionManager {
  // Loaded sessions (in-memory, may or may not have active sandbox)
  private loadedSessions: Map<string, AgentSession> = new Map();

  // Dependencies
  private readonly globalEventBus: EventBus;
  private clientHub: ClientHub;
  private readonly executionConfig: RuntimeConfig['executionEnvironment'];
  private readonly adapters: {
    persistence: PersistenceAdapter;
  };

  constructor(
    globalEventBus: EventBus,
    executionConfig: RuntimeConfig['executionEnvironment'],
    adapters: {
      persistence: PersistenceAdapter;
    },
    clientHub?: ClientHub,
  ) {
    this.globalEventBus = globalEventBus;
    this.executionConfig = executionConfig;
    this.adapters = adapters;
    // Use provided clientHub or create a mock one
    // The real clientHub is typically set via setClientHub after WebSocket server is created
    this.clientHub = clientHub ?? new MockClientHub();
    logger.info('SessionManager initialized with injected adapters');
  }

  /**
   * Set the ClientHub for broadcasting events to connected clients
   * Called after WebSocket server is created
   */
  setClientHub(clientHub: ClientHub): void {
    this.clientHub = clientHub;
    logger.info('ClientHub updated on SessionManager');
  }

  /**
   * Get the current ClientHub
   */
  getClientHub(): ClientHub {
    return this.clientHub;
  }

  // ==========================================================================
  // Session CRUD Operations
  // ==========================================================================

  /**
   * Get all sessions from persistence, enriched with runtime state
   */
  async getAllSessions(): Promise<SessionListItem[]> {
    try {
      const persisted = await this.adapters.persistence.listAllSessions();

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
  private getRuntimeState(sessionId: string): SessionRuntimeState {
    const session = this.loadedSessions.get(sessionId);
    if (!session) {
      return { isLoaded: false, executionEnvironment: null };
    }
    return session.getRuntimeState();
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
        this.adapters.persistence,
        this.executionConfig,
        this.clientHub,
        this.handleEETerminated.bind(this),
      );

      // Add to loaded sessions
      this.loadedSessions.set(session.sessionId, session);

      // Emit global event (sessions list changed)
      this.globalEventBus.emit('sessions:changed');

      return session;
    } catch (error) {
      logger.error({ error, request }, 'Failed to create session');
      throw error;
    }
  }

  /**
   * Load existing session from persistence
   */
  async loadSession(sessionId: string): Promise<AgentSession> {
    try {
      // Check if already loaded
      if (this.loadedSessions.has(sessionId)) {
        logger.warn({ sessionId }, 'Session already loaded, returning existing');
        return this.loadedSessions.get(sessionId)!;
      }

      logger.info({ sessionId }, 'Loading session from persistence...');

      // Create AgentSession instance using static factory (loads from persistence internally)
      const session = await AgentSession.create(
        { sessionId },
        this.adapters.persistence,
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

      // Emit global event (sessions list changed)
      this.globalEventBus.emit('sessions:changed');

      return session;
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to load session');
      throw error;
    }
  }

  /**
   * Get loaded session by ID
   */
  getSession(sessionId: string): AgentSession | undefined {
    return this.loadedSessions.get(sessionId);
  }

  /**
   * Check if session is loaded in memory
   */
  isSessionLoaded(sessionId: string): boolean {
    return this.loadedSessions.has(sessionId);
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
      this.clientHub.broadcast(sessionId, 'session:status', {
        sessionId,
        runtime: { isLoaded: false, executionEnvironment: null },
      });
      // Emit global event (sessions list changed)
      this.globalEventBus.emit('sessions:changed');
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to unload session');
      // Remove from map even if unloading failed
      this.loadedSessions.delete(sessionId);
      throw error;
    }
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
  // Session Queries
  // ==========================================================================

  /**
   * Get loaded session count
   */
  getLoadedSessionCount(): number {
    return this.loadedSessions.size;
  }

  /**
   * Get all loaded session IDs
   */
  getLoadedSessionIds(): string[] {
    return Array.from(this.loadedSessions.keys());
  }

  /**
   * Get all loaded sessions
   */
  getLoadedSessions(): AgentSession[] {
    return Array.from(this.loadedSessions.values());
  }

  /**
   * Get loaded sessions as SessionListItem (with runtime state)
   */
  private getLoadedSessionsAsListItems(): SessionListItem[] {
    return this.getLoadedSessions().map((session) => ({
      ...session.getPersistedListData(),
      runtime: session.getRuntimeState(),
    }));
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Initialize SessionManager
   * Fetch all sessions from persistence
   */
  async initialize(): Promise<void> {
    logger.info('Initializing SessionManager...');
    try {
      const sessions = await this.getAllSessions();
      logger.info({ sessionCount: sessions.length }, 'SessionManager initialized');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize SessionManager');
      throw error;
    }
  }

  /**
   * Check if SessionManager is healthy
   */
  isHealthy(): boolean {
    return true;
  }

  /**
   * Graceful shutdown - unload all sessions
   */
  async shutdown(): Promise<void> {
    logger.info({ loadedCount: this.loadedSessions.size }, 'Shutting down SessionManager...');

    // Unload all loaded sessions
    const sessionIds = Array.from(this.loadedSessions.keys());
    for (const sessionId of sessionIds) {
      try {
        await this.unloadSession(sessionId);
      } catch (error) {
        logger.error({ error, sessionId }, 'Failed to unload session during shutdown');
      }
    }

    logger.info('SessionManager shutdown complete');
  }
}
