/**
 * Persistence Listener - Handles storage sync via event subscription
 *
 * Subscribes to SessionEventBus events and handles persistence operations.
 * Decouples persistence logic from AgentSession, making it:
 * - Testable in isolation
 * - Easy to change persistence strategy
 * - Clear separation of concerns
 *
 * Event handlers:
 * - transcript:changed → save transcript to storage
 * - file:created/modified → save workspace file
 * - file:deleted → delete workspace file
 * - options:update → update session record
 */

import type { AgentArchitectureSessionOptions } from '@ai-systems/shared-types';
import { logger as baseLogger } from '../../config/logger.js';
import type { PersistenceAdapter } from '../../types/persistence-adapter.js';
import type { SessionEventBus } from './session-event-bus.js';
import type { SessionState } from './session-state.js';

// ============================================================================
// PersistenceListener Class
// ============================================================================

/**
 * Listens to SessionEventBus events and handles persistence
 */
export class PersistenceListener {
  private readonly sessionId: string;
  private readonly eventBus: SessionEventBus;
  private readonly persistence: PersistenceAdapter;
  private readonly logger: typeof baseLogger;

  constructor(
    sessionId: string,
    eventBus: SessionEventBus,
    persistence: PersistenceAdapter
  ) {
    this.sessionId = sessionId;
    this.eventBus = eventBus;
    this.persistence = persistence;
    this.logger = baseLogger.child({
      component: 'PersistenceListener',
      sessionId,
    });

    this.setupListeners();
  }

  // =========================================================================
  // Event Listeners Setup
  // =========================================================================

  private setupListeners(): void {
    // Transcript changes
    this.eventBus.on('transcript:changed', this.handleTranscriptChanged.bind(this));

    // File changes
    this.eventBus.on('file:created', this.handleFileCreated.bind(this));
    this.eventBus.on('file:modified', this.handleFileModified.bind(this));
    this.eventBus.on('file:deleted', this.handleFileDeleted.bind(this));

    // Session options changes
    this.eventBus.on('options:update', this.handleOptionsUpdate.bind(this));

    this.logger.debug('Persistence listeners setup complete');
  }

  // =========================================================================
  // Event Handlers
  // =========================================================================

  private async handleTranscriptChanged(data: { content: string }): Promise<void> {
    try {
      await this.persistence.saveTranscript(this.sessionId, data.content);
      this.logger.debug('Persisted transcript');
    } catch (error) {
      this.logger.error({ error }, 'Failed to persist transcript');
    }
  }

  private async handleFileCreated(data: {
    file: { path: string; content: string | undefined };
  }): Promise<void> {
    try {
      await this.persistence.saveWorkspaceFile(this.sessionId, data.file);
      this.logger.debug({ path: data.file.path }, 'Persisted new workspace file');
    } catch (error) {
      this.logger.error(
        { error, path: data.file.path },
        'Failed to persist new workspace file'
      );
    }
  }

  private async handleFileModified(data: {
    file: { path: string; content: string | undefined };
  }): Promise<void> {
    try {
      await this.persistence.saveWorkspaceFile(this.sessionId, data.file);
      this.logger.debug({ path: data.file.path }, 'Persisted modified workspace file');
    } catch (error) {
      this.logger.error(
        { error, path: data.file.path },
        'Failed to persist modified workspace file'
      );
    }
  }

  private async handleFileDeleted(data: { path: string }): Promise<void> {
    try {
      await this.persistence.deleteSessionFile(this.sessionId, data.path);
      this.logger.debug({ path: data.path }, 'Deleted workspace file from persistence');
    } catch (error) {
      this.logger.error(
        { error, path: data.path },
        'Failed to delete workspace file from persistence'
      );
    }
  }

  private async handleOptionsUpdate(data: {
    options: AgentArchitectureSessionOptions;
  }): Promise<void> {
    try {
      await this.persistence.updateSessionRecord(this.sessionId, {
        sessionOptions: data.options,
      });
      this.logger.debug('Persisted session options');
    } catch (error) {
      this.logger.error({ error }, 'Failed to persist session options');
    }
  }

  // =========================================================================
  // Manual Sync Methods
  // =========================================================================

  /**
   * Force a full sync of session state to persistence
   * Used for periodic sync and before session termination
   */
  async syncFullState(state: SessionState): Promise<void> {
    const snapshot = state.toSnapshot();

    this.logger.debug('Starting full state sync');

    try {
      // Save transcript if present
      if (snapshot.rawTranscript !== undefined) {
        await this.persistence.saveTranscript(
          this.sessionId,
          snapshot.rawTranscript
        );
      }

      // Save all workspace files in parallel
      if (snapshot.workspaceFiles.length > 0) {
        await Promise.all(
          snapshot.workspaceFiles.map((file) =>
            this.persistence.saveWorkspaceFile(this.sessionId, file)
          )
        );
      }

      // Update session record with latest activity
      await this.persistence.updateSessionRecord(this.sessionId, {
        lastActivity: snapshot.lastActivity,
      });

      this.logger.debug(
        {
          fileCount: snapshot.workspaceFiles.length,
          hasTranscript: !!snapshot.rawTranscript,
        },
        'Full state sync complete'
      );
    } catch (error) {
      this.logger.error({ error }, 'Failed to sync full state');
      throw error;
    }
  }

  /**
   * Update last activity timestamp in persistence
   */
  async updateLastActivity(timestamp: number): Promise<void> {
    try {
      await this.persistence.updateSessionRecord(this.sessionId, {
        lastActivity: timestamp,
      });
    } catch (error) {
      this.logger.error({ error }, 'Failed to update last activity');
    }
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  /**
   * Cleanup when session is destroyed
   *
   * Note: This class does NOT track its own event listeners.
   * Cleanup relies on SessionEventBus.destroy() being called by AgentSession,
   * which removes all listeners including ours. This is intentional to avoid
   * duplicate bookkeeping.
   *
   * @see SessionEventBus.destroy
   */
  destroy(): void {
    this.logger.debug('PersistenceListener destroyed');
  }
}
