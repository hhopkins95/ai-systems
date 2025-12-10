/**
 * AgentSession - Individual session management
 *
 * Responsibilities:
 * - Load session state from persistence on initialization
 * - Parse transcripts using static parser (no sandbox needed)
 * - Lazily create execution environment only when sendMessage is called
 * - Execute agent queries in execution environment
 * - Track main transcript + subagent transcripts
 * - Monitor workspace file changes
 * - Sync state to persistence periodically
 * - Emit domain events to EventBus
 * - Notify SessionManager when sandbox terminates
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
  SandboxStatus,
  CreateSessionArgs,
  AgentArchitectureSessionOptions,
} from '@ai-systems/shared-types';
import type { ConversationBlock } from '@ai-systems/shared-types';
import type { EventBus } from './event-bus.js';
import type { RuntimeConfig } from '../types/runtime.js';
import { ExecutionEnvironment, WorkspaceFileEvent, TranscriptChangeEvent } from './execution-environment.js';
import { parseTranscript } from '@hhopkins/agent-converters';

/**
 * Callback type for sandbox termination notification
 */
export type OnSandboxTerminatedCallback = (sessionId: string) => void;

/**
 * AgentSession class - manages individual session lifecycle
 */
export class AgentSession {
  // Identifiers
  public readonly sessionId: string;

  // Execution environment (lazy - created on first sendMessage)
  private executionEnvironment?: ExecutionEnvironment;
  private sandboxId?: string;
  private sandboxStatus: SandboxStatus | null = null;
  private statusMessage?: string;
  private lastHealthCheck?: number;
  private sandboxRestartCount: number = 0;

  // Session metadata
  private createdAt?: number;
  private lastActivity?: number;

  // Session data
  private blocks: ConversationBlock[];
  private rawTranscript?: string;  // Combined transcript (main + subagents as JSON)
  private subagents: { id: string; blocks: ConversationBlock[] }[];
  private workspaceFiles: WorkspaceFile[];
  private sessionOptions?: AgentArchitectureSessionOptions;

  // Agent Details
  private agentProfile: AgentProfile;
  private architecture: AgentArchitecture;

  // Services
  private readonly eventBus: EventBus;
  private readonly persistenceAdapter: PersistenceAdapter;
  private readonly executionConfig: RuntimeConfig['executionEnvironment'];

  // Callback for sandbox termination (set by SessionManager)
  private onSandboxTerminated?: OnSandboxTerminatedCallback;

  // Periodic jobs (only active when execution environment exists)
  private syncInterval?: NodeJS.Timeout;
  private sandboxHeartbeat?: NodeJS.Timeout;

  static async create(
    input: {
      sessionId: string
    } | CreateSessionArgs,
    eventBus: EventBus,
    persistenceAdapter: PersistenceAdapter,
    executionConfig: RuntimeConfig['executionEnvironment'],
    onSandboxTerminated?: OnSandboxTerminatedCallback,
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

      return new AgentSession({
        eventBus,
        persistenceAdapter,
        executionConfig,
        agentProfile,
        onSandboxTerminated,
        architecture: sessionData.type,
        sessionId: sessionData.sessionId,
        blocks,
        subagents,
        workspaceFiles: sessionData.workspaceFiles,
        sessionOptions: sessionData.sessionOptions,
        createdAt: sessionData.createdAt,
        rawTranscript: sessionData.rawTranscript,
      });
    } else {
      // Create a new session
      const newSessionId = randomUUID();
      const agentProfile = await persistenceAdapter.loadAgentProfile(input.agentProfileRef);
      if (!agentProfile) {
        throw new Error(`Agent profile ${input.agentProfileRef} not found in persistence`);
      }

      const session = new AgentSession({
        eventBus,
        persistenceAdapter,
        executionConfig,
        agentProfile,
        onSandboxTerminated,
        architecture: input.architecture,
        sessionId: newSessionId,
        blocks: [],
        subagents: [],
        workspaceFiles: [...(agentProfile.defaultWorkspaceFiles ?? []), ...(input.defaultWorkspaceFiles ?? [])],
        sessionOptions: input.sessionOptions,
        createdAt: Date.now(),
        rawTranscript: undefined,
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
      eventBus: EventBus;
      persistenceAdapter: PersistenceAdapter;
      executionConfig: RuntimeConfig['executionEnvironment'];
      agentProfile: AgentProfile;
      onSandboxTerminated?: OnSandboxTerminatedCallback;

      // Session Data
      architecture: AgentArchitecture;
      sessionId: string;
      blocks: ConversationBlock[];
      subagents: { id: string; blocks: ConversationBlock[] }[];
      workspaceFiles: WorkspaceFile[];
      sessionOptions?: AgentArchitectureSessionOptions;
      createdAt?: number;
      rawTranscript?: string;
    }
  ) {
    this.eventBus = props.eventBus;
    this.persistenceAdapter = props.persistenceAdapter;
    this.executionConfig = props.executionConfig;
    this.agentProfile = props.agentProfile;
    this.onSandboxTerminated = props.onSandboxTerminated;

    this.architecture = props.architecture;
    this.sessionId = props.sessionId;
    this.blocks = props.blocks;
    this.subagents = props.subagents;
    this.workspaceFiles = props.workspaceFiles;
    this.sessionOptions = props.sessionOptions;
    this.createdAt = props.createdAt;
    this.rawTranscript = props.rawTranscript;

    this.lastActivity = Date.now();
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
    this.emitRuntimeStatus("Creating execution environment...");
    this.executionEnvironment = await ExecutionEnvironment.create({
      sessionId: this.sessionId,
      architecture: this.architecture,
      agentProfile: this.agentProfile,
      environmentOptions: this.executionConfig,
    });
    this.sandboxId = this.executionEnvironment.getId();

    // Step 2: Prepare the session
    this.emitRuntimeStatus("Setting up session files...");
    await this.executionEnvironment.prepareSession({
      sessionId: this.sessionId,
      agentProfile: this.agentProfile,
      workspaceFiles: this.workspaceFiles,
      sessionTranscript: this.rawTranscript,
      sessionOptions: this.sessionOptions,
    });

    // Step 3: Start watchers
    this.emitRuntimeStatus("Initializing file watchers...");
    await this.startWatchers();

    // Step 4: Start monitoring and sync
    this.startPeriodicSync();
    this.startHealthMonitoring();

    this.sandboxStatus = 'ready';
    this.lastHealthCheck = Date.now();
    this.emitRuntimeStatus("Ready");

    logger.info({ sessionId: this.sessionId, sandboxId: this.sandboxId }, 'Execution environment activated');
  }

  /**
   * Start file watchers for workspace and transcript directories
   */
  private async startWatchers(): Promise<void> {
    if (!this.executionEnvironment) {
      throw new Error('Cannot start watchers without execution environment');
    }

    logger.info({ sessionId: this.sessionId }, 'Starting file watchers...');

    // Start both watchers using execution environment methods and wait for them to be ready
    await Promise.all([
      this.executionEnvironment.watchWorkspaceFiles((event) => {
        this.handleWorkspaceFileChange(event);
      }),
      this.executionEnvironment.watchSessionTranscriptChanges((event) => {
        this.handleTranscriptChange(event);
      }),
    ]);

    logger.info({ sessionId: this.sessionId }, 'File watchers ready');
  }

  /**
   * Handle workspace file change events from execution environment
   */
  private handleWorkspaceFileChange(event: WorkspaceFileEvent): void {
    // Skip files with no content (unlink events or binary/large files)
    if (event.content === undefined) {
      logger.debug({ sessionId: this.sessionId, path: event.path, type: event.type }, 'Skipping file with no content');
      return;
    }

    logger.debug({
      sessionId: this.sessionId,
      path: event.path,
      type: event.type,
      contentLength: event.content.length
    }, 'Workspace file changed');

    const file: WorkspaceFile = { path: event.path, content: event.content };

    // Direct state update
    const existingIndex = this.workspaceFiles.findIndex(f => f.path === file.path);
    if (existingIndex >= 0) {
      this.workspaceFiles[existingIndex] = file;
    } else {
      this.workspaceFiles.push(file);
    }

    // Persist immediately (fire and forget, log errors)
    this.persistenceAdapter.saveWorkspaceFile(this.sessionId, file)
      .then(() => logger.debug({ sessionId: this.sessionId, path: file.path }, 'Persisted workspace file'))
      .catch(error => logger.error({ error, sessionId: this.sessionId, path: file.path }, 'Failed to persist workspace file'));

    // Emit for WebSocket clients
    this.eventBus.emit('session:file:modified', {
      sessionId: this.sessionId,
      file,
    });
  }

  /**
   * Handle transcript change events from execution environment.
   * Receives the full combined transcript (main + subagents) on any change.
   */
  private handleTranscriptChange(event: TranscriptChangeEvent): void {
    if (!this.executionEnvironment) return;

    logger.debug({
      sessionId: this.sessionId,
      contentLength: event.content.length,
    }, 'Transcript changed');

    // Store the combined transcript
    this.rawTranscript = event.content;

    // Parse into blocks
    const parsed = parseTranscript(this.architecture, event.content);
    this.blocks = parsed.blocks;
    this.subagents = parsed.subagents.map(sub => ({
      id: sub.id,
      blocks: sub.blocks,
    }));

    // Persist immediately
    this.persistenceAdapter.saveTranscript(this.sessionId, event.content)
      .then(() => logger.debug({ sessionId: this.sessionId }, 'Persisted transcript'))
      .catch(error => logger.error({ error, sessionId: this.sessionId }, 'Failed to persist transcript'));

    // Emit for WebSocket clients
    this.eventBus.emit('session:transcript:changed', {
      sessionId: this.sessionId,
      content: event.content,
    });
  }

  /**
   * Emit the current runtime status
   * @param message Optional human-readable status message for UI display
   */
  private emitRuntimeStatus(message?: string): void {
    this.statusMessage = message;
    this.eventBus.emit('session:status', {
      sessionId: this.sessionId,
      runtime: this.getRuntimeState(),
    });
  }

  /**
   * Send message to agent and stream responses
   */
  async sendMessage(message: string): Promise<void> {
    // Emit 'starting' status immediately when execution environment doesn't exist
    // This provides feedback to clients before environment creation (which can take a while)
    if (!this.executionEnvironment) {
      this.sandboxStatus = 'starting';
      this.emitRuntimeStatus("Preparing...");
    }

    // Lazily create execution environment if it doesn't exist
    await this.activateExecutionEnvironment();

    // Update lastActivity timestamp
    this.lastActivity = Date.now();

    // Emit user message block before agent processing
    const userBlockId = randomUUID();
    const userBlock = {
      id: userBlockId,
      type: 'user_message' as const,
      content: message,
      timestamp: new Date().toISOString(),
    };

    this.eventBus.emit('session:block:start', {
      sessionId: this.sessionId,
      conversationId: 'main',
      block: userBlock,
    });
    this.eventBus.emit('session:block:complete', {
      sessionId: this.sessionId,
      conversationId: 'main',
      blockId: userBlockId,
      block: userBlock,
    });

    try {
      logger.info(
        {
          sessionId: this.sessionId,
          architecture: this.architecture,
          messageLength: message.length,
        },
        'Sending message to agent...'
      );

      for await (const event of this.executionEnvironment!.executeQuery({ query: message, options: this.sessionOptions })) {
        switch (event.type) {
          case 'block_start':
            this.eventBus.emit('session:block:start', {
              sessionId: this.sessionId,
              conversationId: event.conversationId,
              block: event.block,
            });
            break;

          case 'text_delta':
            this.eventBus.emit('session:block:delta', {
              sessionId: this.sessionId,
              conversationId: event.conversationId,
              blockId: event.blockId,
              delta: event.delta,
            });
            break;

          case 'block_update':
            this.eventBus.emit('session:block:update', {
              sessionId: this.sessionId,
              conversationId: event.conversationId,
              blockId: event.blockId,
              updates: event.updates,
            });
            break;

          case 'block_complete':
            this.eventBus.emit('session:block:complete', {
              sessionId: this.sessionId,
              conversationId: event.conversationId,
              blockId: event.blockId,
              block: event.block,
            });
            break;

          case 'metadata_update':
            this.eventBus.emit('session:metadata:update', {
              sessionId: this.sessionId,
              conversationId: event.conversationId,
              metadata: event.metadata,
            });
            break;
        }
      }

      // Update lastActivity after message processing completes
      this.lastActivity = Date.now();
    } catch (error) {
      logger.error({ error, sessionId: this.sessionId, architecture: this.architecture }, 'Failed to send message');

      // Update sandbox state to error
      this.sandboxStatus = 'error';
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Emit status update first so UI reflects the error state
      this.emitRuntimeStatus(errorMessage);

      // Then emit error event for error block display
      this.eventBus.emit('session:error', {
        sessionId: this.sessionId,
        error: {
          message: errorMessage,
        },
      });

      throw error;
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

    this.workspaceFiles = workspaceFiles;
    this.rawTranscript = transcript ?? undefined;

    // Parse blocks
    if (transcript) {
      const parsed = parseTranscript(this.architecture, transcript);
      this.blocks = parsed.blocks;
      this.subagents = parsed.subagents.map(sub => ({
        id: sub.id,
        blocks: sub.blocks,
      }));
    } else {
      this.blocks = [];
      this.subagents = [];
    }
  }

  private async persistFullSessionState(): Promise<void> {
    // Save the combined transcript
    await this.persistenceAdapter.saveTranscript(this.sessionId, this.rawTranscript ?? "");

    // Save all the workspace files
    await Promise.all(
      this.workspaceFiles.map(file =>
        this.persistenceAdapter.saveWorkspaceFile(this.sessionId, file)
      )
    );

    // Update lastActivity
    await this.persistenceAdapter.updateSessionRecord(this.sessionId, {
      lastActivity: this.lastActivity,
    });
  }

  async syncSessionStateToStorage(): Promise<void> {
    await this.syncSessionStateWithExecutionEnvironment();
    await this.persistFullSessionState();
  }

  async updateSessionOptions(sessionOptions: AgentArchitectureSessionOptions): Promise<void> {
    this.sessionOptions = sessionOptions;
    await this.persistenceAdapter.updateSessionRecord(this.sessionId, {
      sessionOptions: sessionOptions,
    });
    this.eventBus.emit('session:options:update', {
      sessionId: this.sessionId,
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
    if (this.sandboxHeartbeat) {
      clearInterval(this.sandboxHeartbeat);
      this.sandboxHeartbeat = undefined;
    }
  }

  /**
   * Get full session state for clients
   */
  getState(): RuntimeSessionData {
    return {
      sessionId: this.sessionId,
      agentProfileReference: this.agentProfile.id,
      lastActivity: this.lastActivity,
      createdAt: this.createdAt,
      type: this.architecture,
      sessionOptions: this.sessionOptions,
      runtime: this.getRuntimeState(),
      blocks: this.blocks,
      workspaceFiles: this.workspaceFiles,
      subagents: this.subagents.map(s => ({
        id: s.id,
        blocks: s.blocks,
      })),
    };
  }

  /**
   * Get minimal session data for persistence
   */
  getPersistedListData(): PersistedSessionListData {
    return {
      sessionId: this.sessionId,
      type: this.architecture,
      agentProfileReference: this.agentProfile.id,
      sessionOptions: this.sessionOptions,
      lastActivity: this.lastActivity,
      createdAt: this.createdAt,
    };
  }

  /**
   * Get runtime state (isLoaded, sandbox info)
   */
  getRuntimeState(): SessionRuntimeState {
    return {
      isLoaded: true, // If this method is called, session is loaded
      sandbox: this.sandboxStatus ? {
        sandboxId: this.sandboxId,
        status: this.sandboxStatus,
        statusMessage: this.statusMessage,
        restartCount: this.sandboxRestartCount,
        lastHealthCheck: this.lastHealthCheck ?? Date.now(),
      } : null,
    };
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
    if (this.sandboxHeartbeat) {
      logger.warn({ sessionId: this.sessionId }, 'Health monitoring already running');
      return;
    }

    logger.info({ sessionId: this.sessionId }, 'Starting execution environment health monitoring');

    this.sandboxHeartbeat = setInterval(async () => {
      if (!this.executionEnvironment) return;

      const isHealthy = await this.executionEnvironment.isHealthy();
      this.lastHealthCheck = Date.now();

      if (!isHealthy) {
        // Execution environment has terminated
        logger.warn({ sessionId: this.sessionId }, 'Execution environment terminated');
        this.sandboxStatus = 'terminated';
        this.emitRuntimeStatus();

        // Stop monitoring and watchers
        this.stopWatchersAndJobs();

        // Notify SessionManager to unload this session
        if (this.onSandboxTerminated) {
          this.onSandboxTerminated(this.sessionId);
        }
      } else {
        // Execution environment is healthy
        if (this.sandboxStatus !== 'ready') {
          this.sandboxStatus = 'ready';
          this.emitRuntimeStatus();
        }
      }
    }, 1000 * 30); // 30 seconds
  }
}
