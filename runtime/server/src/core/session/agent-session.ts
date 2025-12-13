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
import { logger } from '../config/logger.js';
import type { PersistenceAdapter } from '../types/persistence-adapter.js';
import type { AgentProfile } from '@ai-systems/shared-types';
import type {
  RuntimeSessionData,
  PersistedSessionListData,
  WorkspaceFile,
  AgentArchitecture,
  SessionRuntimeState,
  CreateSessionArgs,
  AgentArchitectureSessionOptions,
} from '@ai-systems/shared-types';
import type { ConversationBlock } from '@ai-systems/shared-types';
import type { RuntimeConfig } from '../types/runtime.js';
import type { ClientHub } from './session/client-hub.js';
import { ExecutionEnvironment } from './execution-environment.js';
import { parseTranscript } from '@hhopkins/agent-converters';
import { SessionEventBus } from './session/session-event-bus.js';
import { SessionState } from './session/session-state.js';
import { PersistenceListener } from './session/persistence-listener.js';
import { ClientBroadcastListener } from './session/client-broadcast-listener.js';

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

      let blocks: ConversationBlock[] = [];
      let subagents: { id: string; blocks: ConversationBlock[] }[] = [];
      if (sessionData.rawTranscript) {
        // parse the saved combined transcript into blocks + subagents
        const parsed = parseTranscript(sessionData.type, sessionData.rawTranscript);
        blocks = parsed.blocks;
        subagents = parsed.subagents;
      }

      // Create session event bus
      const eventBus = new SessionEventBus(sessionData.sessionId);

      // Create session state
      const state = new SessionState({
        sessionId: sessionData.sessionId,
        architecture: sessionData.type,
        agentProfileId: agentProfile.id,
        blocks,
        subagents,
        workspaceFiles: sessionData.workspaceFiles,
        sessionOptions: sessionData.sessionOptions,
        createdAt: sessionData.createdAt,
        rawTranscript: sessionData.rawTranscript,
      });

      // Create listeners
      const persistenceListener = new PersistenceListener(sessionData.sessionId, eventBus, persistenceAdapter);
      const clientBroadcastListener = new ClientBroadcastListener(sessionData.sessionId, eventBus, clientHub);

      return new AgentSession({
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
    } else {
      // Create a new session
      const newSessionId = generateSessionId(input.architecture);
      const agentProfile = await persistenceAdapter.loadAgentProfile(input.agentProfileRef);
      if (!agentProfile) {
        throw new Error(`Agent profile ${input.agentProfileRef} not found in persistence`);
      }

      // Create session event bus
      const eventBus = new SessionEventBus(newSessionId);

      // Create session state
      const state = new SessionState({
        sessionId: newSessionId,
        architecture: input.architecture,
        agentProfileId: agentProfile.id,
        blocks: [],
        subagents: [],
        workspaceFiles: [...(agentProfile.defaultWorkspaceFiles ?? []), ...(input.defaultWorkspaceFiles ?? [])],
        sessionOptions: input.sessionOptions,
        createdAt: Date.now(),
      });

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

    // Set up internal event listeners for state updates
    this.setupEventListeners();
  }

  /**
   * Set up internal event listeners for state management
   */
  private setupEventListeners(): void {
    // Update state when transcript changes
    this.eventBus.on('transcript:changed', (data) => {
      this.state.setRawTranscript(data.content);
      const parsed = parseTranscript(this.state.architecture, data.content);
      this.state.setBlocks(parsed.blocks);
      this.state.setSubagents(parsed.subagents.map(sub => ({
        id: sub.id,
        blocks: sub.blocks,
      })));
    });

    // Update state when files change
    this.eventBus.on('file:created', (data) => {
      this.state.updateWorkspaceFile(data.file);
    });

    this.eventBus.on('file:modified', (data) => {
      this.state.updateWorkspaceFile(data.file);
    });

    this.eventBus.on('file:deleted', (data) => {
      this.state.removeWorkspaceFile(data.path);
    });

    // Handle errors
    this.eventBus.on('error', (data) => {
      this.state.setLastError({
        message: data.message,
        code: data.code,
        timestamp: Date.now(),
      });
    });
  }

  /**
   * Lazily create execution environment when needed (private, called by sendMessage)
   */
  private async activateExecutionEnvironment(): Promise<void> {
    if (this.executionEnvironment) return;

    logger.info({ sessionId: this.sessionId }, 'Activating execution environment...');

    // Note: 'starting' status is already emitted by sendMessage() before calling this method
    // This ensures clients get immediate feedback before the environment creation process

    // Step 1: Create the execution environment
    this.state.setStatusMessage("Creating execution environment...");
    this.emitRuntimeStatus();
    this.executionEnvironment = await ExecutionEnvironment.create({
      sessionId: this.sessionId,
      architecture: this.state.architecture,
      agentProfile: this.agentProfile,
      environmentOptions: this.executionConfig,
      eventBus: this.eventBus,
    });
    this.state.setEEId(this.executionEnvironment.getId());

    // Step 2: Prepare the session
    this.state.setStatusMessage("Setting up session files...");
    this.emitRuntimeStatus();
    await this.executionEnvironment.prepareSession({
      sessionId: this.sessionId,
      agentProfile: this.agentProfile,
      workspaceFiles: this.state.workspaceFiles,
      sessionTranscript: this.state.rawTranscript,
      sessionOptions: this.state.sessionOptions,
    });

    // Step 3: Start watchers
    this.state.setStatusMessage("Initializing file watchers...");
    this.emitRuntimeStatus();
    await this.startWatchers();

    // Step 4: Start monitoring and sync
    this.startPeriodicSync();
    this.startHealthMonitoring();

    this.state.setEEStatus('ready');
    this.state.setLastHealthCheck(Date.now());
    this.state.setStatusMessage("Ready");
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
    this.eventBus.emit('status:changed', {
      runtime: this.state.getRuntimeState(),
    });
  }

  /**
   * Send message to agent
   * Events are emitted directly by ExecutionEnvironment to the event bus
   */
  async sendMessage(message: string): Promise<void> {
    // Emit 'starting' status immediately when execution environment doesn't exist
    // This provides feedback to clients before environment creation (which can take a while)
    if (!this.executionEnvironment) {
      this.state.setEEStatus('starting');
      this.state.setStatusMessage("Preparing...");
      this.emitRuntimeStatus();
    }

    // Track query start
    this.state.setActiveQueryStartedAt(Date.now());
    this.emitRuntimeStatus();

    try {
      // Lazily create execution environment if it doesn't exist
      await this.activateExecutionEnvironment();

      // Update lastActivity timestamp
      this.state.setLastActivity(Date.now());

      // Emit user message block before agent processing
      const userBlockId = randomUUID();
      const userBlock = {
        id: userBlockId,
        type: 'user_message' as const,
        content: message,
        timestamp: new Date().toISOString(),
      };

      this.eventBus.emit('block:start', {
        conversationId: 'main',
        block: userBlock,
      });
      this.eventBus.emit('block:complete', {
        conversationId: 'main',
        blockId: userBlockId,
        block: userBlock,
      });

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

      // Update lastActivity after message processing completes
      this.state.setLastActivity(Date.now());
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId, architecture: this.state.architecture }, 'Failed to send message');

      // Update execution environment state to error
      this.state.setEEStatus('error');
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.state.setLastError({
        message: errorMessage,
        timestamp: Date.now(),
      });
      this.state.setStatusMessage(errorMessage);

      // Emit status update so UI reflects the error state
      this.emitRuntimeStatus();

      // Emit error event for error block display
      this.eventBus.emit('error', {
        message: errorMessage,
      });

      throw error;
    } finally {
      // Clear query state
      this.state.setActiveQueryStartedAt(undefined);
      this.emitRuntimeStatus();
    }
  }

  private async syncSessionStateWithExecutionEnvironment(): Promise<void> {
    if (!this.executionEnvironment) {
      // No execution environment, nothing to sync from
      return;
    }

    // Read combined transcript from execution environment
    const transcript = await this.executionEnvironment.readSessionTranscript();

    // Read workspace files from execution environment
    const workspaceFiles = await this.executionEnvironment.getWorkspaceFiles();

    this.state.setWorkspaceFiles(workspaceFiles);
    this.state.setRawTranscript(transcript ?? undefined);

    // Parse blocks
    if (transcript) {
      const parsed = parseTranscript(this.state.architecture, transcript);
      this.state.setBlocks(parsed.blocks);
      this.state.setSubagents(parsed.subagents.map(sub => ({
        id: sub.id,
        blocks: sub.blocks,
      })));
    } else {
      this.state.setBlocks([]);
      this.state.setSubagents([]);
    }
  }

  private async persistFullSessionState(): Promise<void> {
    // Use PersistenceListener for full sync
    await this.persistenceListener.syncFullState(this.state);
  }

  async syncSessionStateToStorage(): Promise<void> {
    await this.syncSessionStateWithExecutionEnvironment();
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

    try {
      this.stopWatchersAndJobs();
      await this.syncSessionStateToStorage();
      await this.executionEnvironment.cleanup();

      this.executionEnvironment = undefined;
      this.state.setEEId(undefined);
      this.state.setEEStatus('terminated');
      this.state.setStatusMessage('Execution environment terminated');
      this.emitRuntimeStatus();

      logger.info({ sessionId: this.sessionId }, 'Execution environment terminated successfully');
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId }, 'Failed to terminate execution environment');
      this.state.setEEStatus('error');
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.state.setLastError({ message: errorMessage, timestamp: Date.now() });
      this.state.setStatusMessage(errorMessage);
      this.emitRuntimeStatus();
      throw error;
    }
  }

  async updateSessionOptions(sessionOptions: AgentArchitectureSessionOptions): Promise<void> {
    this.state.setSessionOptions(sessionOptions);
    // Emit to event bus - PersistenceListener and ClientBroadcastListener will handle it
    this.eventBus.emit('options:update', {
      options: sessionOptions,
    });
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

    this.healthCheckInterval = setInterval(async () => {
      if (!this.executionEnvironment) return;

      const isHealthy = await this.executionEnvironment.isHealthy();
      this.state.setLastHealthCheck(Date.now());

      if (!isHealthy) {
        // Execution environment has terminated
        logger.warn({ sessionId: this.sessionId }, 'Execution environment terminated');
        this.state.setEEStatus('terminated');
        this.emitRuntimeStatus();

        // Stop monitoring and watchers
        this.stopWatchersAndJobs();

        // Notify SessionManager to unload this session
        if (this.onEETerminated) {
          this.onEETerminated(this.sessionId);
        }
      } else {
        // Execution environment is healthy
        if (this.state.eeStatus !== 'ready') {
          this.state.setEEStatus('ready');
          this.emitRuntimeStatus();
        }
      }
    }, 1000 * 30); // 30 seconds
  }
}
