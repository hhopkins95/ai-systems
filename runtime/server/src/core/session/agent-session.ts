/**
 * AgentSession - Session coordinator
 *
 * This class coordinates the session components:
 * - SessionState: manages session data
 * - SessionEventBus: per-session event emitter
 * - ClientBroadcastListener: broadcasts events to connected clients
 * - PersistenceListener: syncs state to storage
 * - ExecutionEnvironment: runs agent queries
 *
 * Responsibilities:
 * - Coordinate session lifecycle
 * - Wire up event listeners
 * - Manage ExecutionEnvironment lifecycle
 * - Handle periodic sync and health monitoring
 */

import { randomUUID } from 'crypto';
import { logger } from '../../config/logger.js';
import type { PersistenceAdapter } from '../../types/persistence-adapter.js';
import type { AgentProfile } from '@ai-systems/shared-types';
import {
  createSessionEvent,
  type RuntimeSessionData,
  type PersistedSessionListData,
  type AgentArchitecture,
  type SessionRuntimeState,
  type CreateSessionArgs,
  type AgentArchitectureSessionOptions,
} from '@ai-systems/shared-types';
import type { RuntimeConfig } from '../../types/runtime.js';
import type { ClientHub } from '../host/client-hub.js';
import { ExecutionEnvironment } from './execution-environment.js';
import { SessionEventBus } from './session-event-bus.js';
import { SessionState } from './session-state.js';
import { PersistenceListener } from './persistence-listener.js';
import { ClientBroadcastListener } from './client-broadcast-listener.js';

/**
 * Generate a session ID in the appropriate format for the architecture
 */
function generateSessionId(architecture: AgentArchitecture): string {
  if (architecture === 'opencode') {
    // OpenCode format: ses_<timestamp_hex>_<random>
    const timestamp = Date.now();
    const timeBytes = timestamp.toString(16).padStart(12, '0');
    const random = Math.random().toString(36).substring(2, 13);
    return `ses_${timeBytes}_${random}`;
  }
  // Default to UUID for claude-sdk
  return randomUUID();
}

/**
 * Callback type for execution environment termination notification
 */
export type OnExecutionEnvironmentTerminatedCallback = (sessionId: string) => void;

/**
 * AgentSession class - coordinates session components
 */
export class AgentSession {
  // Core identity
  public readonly sessionId: string;

  // Session components (new architecture)
  private readonly state: SessionState;
  private readonly eventBus: SessionEventBus;
  private readonly persistenceListener: PersistenceListener;
  private readonly clientBroadcastListener: ClientBroadcastListener;

  // Execution environment (lazy - created on first sendMessage)
  private executionEnvironment?: ExecutionEnvironment;

  // External dependencies
  private readonly agentProfile: AgentProfile;
  private readonly persistenceAdapter: PersistenceAdapter;
  private readonly executionConfig: RuntimeConfig['executionEnvironment'];
  private readonly clientHub: ClientHub;

  // Callback for execution environment termination (set by SessionManager)
  private onEETerminated?: OnExecutionEnvironmentTerminatedCallback;

  // Periodic jobs (only active when execution environment exists)
  private syncInterval?: NodeJS.Timeout;
  private healthCheckInterval?: NodeJS.Timeout;

  static async create(
    input: {
      sessionId: string
    } | CreateSessionArgs,
    persistenceAdapter: PersistenceAdapter,
    executionConfig: RuntimeConfig['executionEnvironment'],
    clientHub: ClientHub,
    onEETerminated?: OnExecutionEnvironmentTerminatedCallback,
  ): Promise<AgentSession> {

    // Load existing session from persistence
    if ('sessionId' in input) {
      const sessionData = await persistenceAdapter.loadSession(input.sessionId);

      if (!sessionData) {
        throw new Error(`Session ${input.sessionId} not found in persistence`);
      }

      const agentProfile = await persistenceAdapter.loadAgentProfile(sessionData.agentProfileReference);

      if (!agentProfile) {
        throw new Error(`Agent profile ${sessionData.agentProfileReference} not found in persistence`);
      }

      // Create session event bus
      const eventBus = new SessionEventBus(sessionData.sessionId);

      // Create session state (parses transcript internally)
      const state = new SessionState({
        sessionId: sessionData.sessionId,
        architecture: sessionData.type,
        agentProfileId: agentProfile.id,
        workspaceFiles: sessionData.workspaceFiles,
        sessionOptions: sessionData.sessionOptions,
        createdAt: sessionData.createdAt,
        rawTranscript: sessionData.rawTranscript,
      }, eventBus);

      // Create listeners
      const persistenceListener = new PersistenceListener(sessionData.sessionId, eventBus, persistenceAdapter);
      const clientBroadcastListener = new ClientBroadcastListener(sessionData.sessionId, eventBus, clientHub);

      const session = new AgentSession({
        state,
        eventBus,
        persistenceListener,
        clientBroadcastListener,
        persistenceAdapter,
        executionConfig,
        agentProfile,
        clientHub,
        onEETerminated,
      });

      // Emit session:initialized event
      eventBus.emit('session:initialized', createSessionEvent('session:initialized', {
        isNew: false,
        hasTranscript: !!sessionData.rawTranscript,
        workspaceFileCount: sessionData.workspaceFiles?.length ?? 0,
        blockCount: state.blocks.length,
      }, {
        sessionId: sessionData.sessionId,
        source: 'server',
      }));

      return session;
    } else {
      // Create a new session
      const newSessionId = generateSessionId(input.architecture);
      const agentProfile = await persistenceAdapter.loadAgentProfile(input.agentProfileRef);
      if (!agentProfile) {
        throw new Error(`Agent profile ${input.agentProfileRef} not found in persistence`);
      }

      // Create session event bus
      const eventBus = new SessionEventBus(newSessionId);

      // Create session state (no transcript for new session)
      const workspaceFiles = [...(agentProfile.defaultWorkspaceFiles ?? []), ...(input.defaultWorkspaceFiles ?? [])];
      const state = new SessionState({
        sessionId: newSessionId,
        architecture: input.architecture,
        agentProfileId: agentProfile.id,
        workspaceFiles,
        sessionOptions: input.sessionOptions,
        createdAt: Date.now(),
      }, eventBus);

      // Create listeners
      const persistenceListener = new PersistenceListener(newSessionId, eventBus, persistenceAdapter);
      const clientBroadcastListener = new ClientBroadcastListener(newSessionId, eventBus, clientHub);

      const session = new AgentSession({
        state,
        eventBus,
        persistenceListener,
        clientBroadcastListener,
        persistenceAdapter,
        executionConfig,
        agentProfile,
        clientHub,
        onEETerminated,
      });

      // create a new session record in persistence
      await persistenceAdapter.createSessionRecord({
        sessionId: newSessionId,
        agentProfileReference: input.agentProfileRef,
        type: input.architecture,
        createdAt: Date.now(),
        sessionOptions: input.sessionOptions,
      });

      // persist the full session state (will persist any default workspace files)
      await session.persistFullSessionState();

      // Emit session:initialized event
      eventBus.emit('session:initialized', createSessionEvent('session:initialized', {
        isNew: true,
        hasTranscript: false,
        workspaceFileCount: workspaceFiles.length,
        blockCount: 0,
      }, {
        sessionId: newSessionId,
        source: 'server',
      }));

      return session;
    }
  }

  private constructor(
    props: {
      state: SessionState;
      eventBus: SessionEventBus;
      persistenceListener: PersistenceListener;
      clientBroadcastListener: ClientBroadcastListener;
      persistenceAdapter: PersistenceAdapter;
      executionConfig: RuntimeConfig['executionEnvironment'];
      agentProfile: AgentProfile;
      clientHub: ClientHub;
      onEETerminated?: OnExecutionEnvironmentTerminatedCallback;
    }
  ) {
    this.state = props.state;
    this.eventBus = props.eventBus;
    this.persistenceListener = props.persistenceListener;
    this.clientBroadcastListener = props.clientBroadcastListener;
    this.persistenceAdapter = props.persistenceAdapter;
    this.executionConfig = props.executionConfig;
    this.agentProfile = props.agentProfile;
    this.clientHub = props.clientHub;
    this.onEETerminated = props.onEETerminated;

    this.sessionId = props.state.sessionId;
  }

  /**
   * Lazily create execution environment when needed (private, called by sendMessage)
   */
  private async activateExecutionEnvironment(): Promise<void> {
    if (this.executionEnvironment) return;

    logger.info({ sessionId: this.sessionId }, 'Activating execution environment...');

    const context = { sessionId: this.sessionId, source: 'server' as const };

    // Emit ee:creating event (SessionState will update status)
    this.eventBus.emit('ee:creating', createSessionEvent('ee:creating', {
      statusMessage: 'Creating execution environment...',
    }, context));
    this.emitRuntimeStatus();

    // Step 1: Create the execution environment
    this.executionEnvironment = await ExecutionEnvironment.create({
      sessionId: this.sessionId,
      architecture: this.state.architecture,
      agentProfile: this.agentProfile,
      environmentOptions: this.executionConfig,
      eventBus: this.eventBus,
    });

    // Step 2: Prepare the session
    await this.executionEnvironment.prepareSession({
      sessionId: this.sessionId,
      agentProfile: this.agentProfile,
      workspaceFiles: this.state.workspaceFiles,
      sessionTranscript: this.state.rawTranscript,
      sessionOptions: this.state.sessionOptions,
    });

    // Step 3: Start watchers
    await this.startWatchers();

    // Step 4: Start monitoring and sync
    this.startPeriodicSync();
    this.startHealthMonitoring();

    // Emit ee:ready event (SessionState will update status, eeId, etc.)
    this.eventBus.emit('ee:ready', createSessionEvent('ee:ready', {
      eeId: this.executionEnvironment.getId(),
    }, context));
    this.emitRuntimeStatus();

    logger.info({ sessionId: this.sessionId, sandboxId: this.state.eeId }, 'Execution environment activated');
  }

  /**
   * Start file watchers for workspace and transcript directories
   * With the new architecture, watchers emit directly to the event bus
   */
  private async startWatchers(): Promise<void> {
    if (!this.executionEnvironment) {
      throw new Error('Cannot start watchers without execution environment');
    }

    logger.info({ sessionId: this.sessionId }, 'Starting file watchers...');

    // Start both watchers - they emit directly to the event bus now
    await Promise.all([
      this.executionEnvironment.watchWorkspaceFiles(),
      this.executionEnvironment.watchSessionTranscriptChanges(),
    ]);

    logger.info({ sessionId: this.sessionId }, 'File watchers ready');
  }

  /**
   * Emit the current runtime status to event bus
   */
  private emitRuntimeStatus(): void {
    this.eventBus.emit('status', createSessionEvent('status', {
      runtime: this.state.getRuntimeState(),
    }, {
      sessionId: this.sessionId,
      source: 'server',
    }));
  }

  /**
   * Send message to agent
   * Events are emitted directly by ExecutionEnvironment to the event bus
   */
  async sendMessage(message: string): Promise<void> {
    const context = { sessionId: this.sessionId, source: 'server' as const };
    const queryStartTime = Date.now();

    // Emit 'starting' status immediately when execution environment doesn't exist
    // This provides feedback to clients before environment creation (which can take a while)
    if (!this.executionEnvironment) {
      this.eventBus.emit('ee:creating', createSessionEvent('ee:creating', {
        statusMessage: 'Preparing...',
      }, context));
      this.emitRuntimeStatus();
    }

    // Emit query:started event (SessionState will update activeQueryStartedAt)
    this.eventBus.emit('query:started', createSessionEvent('query:started', {
      message,
    }, context));
    this.emitRuntimeStatus();

    try {
      // Lazily create execution environment if it doesn't exist
      await this.activateExecutionEnvironment();

      // Emit user message block before agent processing
      const userBlockId = randomUUID();
      const userBlock = {
        id: userBlockId,
        type: 'user_message' as const,
        content: message,
        timestamp: new Date().toISOString(),
      };

      const blockContext = {
        sessionId: this.sessionId,
        conversationId: 'main',
        source: 'server' as const,
      };

      // Emit user message block as a single upsert with complete status
      this.eventBus.emit('block:upsert', createSessionEvent('block:upsert', {
        block: { ...userBlock, status: 'complete' },
      }, blockContext));

      logger.info(
        {
          sessionId: this.sessionId,
          architecture: this.state.architecture,
          messageLength: message.length,
        },
        'Sending message to agent...'
      );

      // Execute query - events are emitted directly to the event bus by ExecutionEnvironment
      await this.executionEnvironment!.executeQuery({
        query: message,
        options: this.state.sessionOptions
      });

      // Emit query:completed event (SessionState will clear activeQueryStartedAt)
      this.eventBus.emit('query:completed', createSessionEvent('query:completed', {
        durationMs: Date.now() - queryStartTime,
      }, context));
      this.emitRuntimeStatus();
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId, architecture: this.state.architecture }, 'Failed to send message');

      const errorMessage = error instanceof Error ? error.message : String(error);

      // Emit query:failed event (SessionState will handle state updates)
      this.eventBus.emit('query:failed', createSessionEvent('query:failed', {
        error: errorMessage,
      }, context));
      this.emitRuntimeStatus();

      throw error;
    }
  }

  private async persistFullSessionState(): Promise<void> {
    // Use PersistenceListener for full sync
    await this.persistenceListener.syncFullState(this.state);
  }

  /**
   * Sync current session state to storage.
   * With the event-driven architecture, state is kept up-to-date via events,
   * so this just persists the current state.
   */
  async syncSessionStateToStorage(): Promise<void> {
    await this.persistFullSessionState();
  }

  /**
   * Terminate execution environment while keeping session loaded.
   * Environment will lazily restart on next sendMessage() call.
   */
  async terminateExecutionEnvironment(): Promise<void> {
    if (!this.executionEnvironment) {
      logger.debug({ sessionId: this.sessionId }, 'No execution environment to terminate');
      return;
    }

    logger.info({ sessionId: this.sessionId }, 'Terminating execution environment...');

    const context = { sessionId: this.sessionId, source: 'server' as const };

    try {
      this.stopWatchersAndJobs();
      await this.syncSessionStateToStorage();
      await this.executionEnvironment.cleanup();

      this.executionEnvironment = undefined;

      // Emit ee:terminated event (SessionState will update status)
      this.eventBus.emit('ee:terminated', createSessionEvent('ee:terminated', {
        reason: 'manual',
      }, context));
      this.emitRuntimeStatus();

      logger.info({ sessionId: this.sessionId }, 'Execution environment terminated successfully');
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId }, 'Failed to terminate execution environment');
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Emit error event (SessionState will update lastError)
      this.eventBus.emit('error', createSessionEvent('error', {
        message: errorMessage,
        code: 'EE_TERMINATION_FAILED',
      }, context));
      this.emitRuntimeStatus();
      throw error;
    }
  }

  async updateSessionOptions(sessionOptions: AgentArchitectureSessionOptions): Promise<void> {
    // Emit to event bus - SessionState, PersistenceListener and ClientBroadcastListener will handle it
    this.eventBus.emit('options:update', createSessionEvent('options:update', {
      options: sessionOptions,
    }, {
      sessionId: this.sessionId,
      source: 'server',
    }));
  }

  /**
   * Destroy session and cleanup resources
   */
  async destroy(): Promise<void> {
    try {
      // Stop watchers and periodic jobs first
      this.stopWatchersAndJobs();

      // Sync state if execution environment exists
      if (this.executionEnvironment) {
        await this.syncSessionStateToStorage();
        await this.executionEnvironment.cleanup();
        this.executionEnvironment = undefined;
      }

      // Cleanup listeners
      this.persistenceListener.destroy();
      this.clientBroadcastListener.destroy();
      this.eventBus.destroy();

      logger.info({ sessionId: this.sessionId }, 'Session destroyed');
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId }, 'Failed to destroy AgentSession');
      throw error;
    }
  }

  private stopWatchersAndJobs(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = undefined;
    }
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  /**
   * Get full session state for clients
   */
  getState(): RuntimeSessionData {
    return this.state.toRuntimeSessionData();
  }

  /**
   * Get minimal session data for persistence
   */
  getPersistedListData(): PersistedSessionListData {
    return this.state.toPersistedListData();
  }

  /**
   * Get runtime state (isLoaded, sandbox info)
   */
  getRuntimeState(): SessionRuntimeState {
    return this.state.getRuntimeState();
  }

  private startPeriodicSync(): void {
    this.syncInterval = setInterval(async () => {
      try {
        await this.syncSessionStateToStorage();
      } catch (error) {
        logger.error({ error, sessionId: this.sessionId }, 'Periodic sync failed');
      }
    }, 1000 * 60 * 1); // 1 minute
  }

  private startHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      logger.warn({ sessionId: this.sessionId }, 'Health monitoring already running');
      return;
    }

    logger.info({ sessionId: this.sessionId }, 'Starting execution environment health monitoring');

    const context = { sessionId: this.sessionId, source: 'server' as const };

    this.healthCheckInterval = setInterval(async () => {
      if (!this.executionEnvironment) return;

      const isHealthy = await this.executionEnvironment.isHealthy();

      if (!isHealthy) {
        // Execution environment has terminated
        logger.warn({ sessionId: this.sessionId }, 'Execution environment terminated unexpectedly');

        // Emit ee:terminated event (SessionState will update status)
        this.eventBus.emit('ee:terminated', createSessionEvent('ee:terminated', {
          reason: 'unhealthy',
        }, context));
        this.emitRuntimeStatus();

        // Stop monitoring and watchers
        this.stopWatchersAndJobs();

        // Notify SessionManager to unload this session
        if (this.onEETerminated) {
          this.onEETerminated(this.sessionId);
        }
      } else {
        // Execution environment is healthy
        // If status was not ready (e.g., recovering from error), emit ee:ready
        if (this.state.eeStatus !== 'ready') {
          this.eventBus.emit('ee:ready', createSessionEvent('ee:ready', {
            eeId: this.executionEnvironment.getId(),
          }, context));
          this.emitRuntimeStatus();
        }
      }
    }, 1000 * 30); // 30 seconds
  }
}
