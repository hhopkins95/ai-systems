/**
 * Session State - Event-driven state container for AgentSession
 *
 * Manages session state and subscribes to the event bus for updates.
 * Provides snapshot/restore capabilities for persistence and future
 * deployment targets (Durable Objects, etc.)
 *
 * Benefits:
 * - Event-driven: subscribes to event bus, handles its own state updates
 * - Serializable: toSnapshot()/fromSnapshot() for persistence
 * - Single responsibility: state management separate from coordination
 * - Testable: state logic can be tested in isolation
 * - Portable: state can be moved between hosts
 *
 * Event Subscriptions (conversation events handled by shared reducer):
 * - block:upsert, block:delta → update conversation blocks
 * - subagent:spawned, subagent:completed → update subagent state
 * - session:idle → finalize pending blocks
 * - block:start, block:complete, block:update → legacy (backwards compat)
 *
 * Other event subscriptions (handled directly):
 * - file:created, file:modified, file:deleted → update workspace files
 * - error → update lastError
 * - ee:creating, ee:ready, ee:terminated → EE lifecycle
 * - query:started, query:completed, query:failed → query lifecycle
 * - options:update → session options
 */

import type {
  AgentArchitecture,
  AgentArchitectureSessionOptions,
  AnySessionEvent,
  ConversationBlock,
  ExecutionEnvironmentError,
  ExecutionEnvironmentStatus,
  PersistedSessionListData,
  RuntimeSessionData,
  SessionRuntimeState,
  SubagentState,
  WorkspaceFile,
} from '@ai-systems/shared-types';
import {
  parseTranscript,
  reduceSessionEvent,
  createInitialState,
  isConversationEvent,
  type SessionConversationState,
} from '../../../../../packages/state/dist/index.js';
import type { SessionEventBus } from './session-event-bus.js';

// ============================================================================
// Snapshot Types
// ============================================================================

/**
 * Serializable snapshot of session state
 * Can be persisted, transferred, or used to reconstruct state
 */
export interface SessionStateSnapshot {
  // Identifiers
  sessionId: string;
  architecture: AgentArchitecture;
  agentProfileId: string;

  // Timestamps
  createdAt?: number;
  lastActivity?: number;

  // Session data
  blocks: ConversationBlock[];
  subagents: { id: string; blocks: ConversationBlock[] }[];
  workspaceFiles: WorkspaceFile[];
  rawTranscript?: string;
  sessionOptions?: AgentArchitectureSessionOptions;

  // Execution environment state
  eeStatus: ExecutionEnvironmentStatus | null;
  eeId?: string;
  eeRestartCount: number;
  statusMessage?: string;
  lastHealthCheck?: number;
  lastError?: ExecutionEnvironmentError;

  // Query state
  activeQueryStartedAt?: number;
}

// ============================================================================
// SessionState Class
// ============================================================================

/**
 * Manages session state with snapshot/restore capabilities
 */
export class SessionState {
  // -------------------------------------------------------------------------
  // Identifiers (immutable)
  // -------------------------------------------------------------------------
  private readonly _sessionId: string;
  private readonly _architecture: AgentArchitecture;
  private readonly _agentProfileId: string;

  // -------------------------------------------------------------------------
  // Timestamps
  // -------------------------------------------------------------------------
  private _createdAt?: number;
  private _lastActivity?: number;

  // -------------------------------------------------------------------------
  // Session data
  // -------------------------------------------------------------------------
  /** Conversation state managed by shared reducer */
  private _conversationState: SessionConversationState = createInitialState();
  private _workspaceFiles: WorkspaceFile[] = [];
  private _rawTranscript?: string;
  private _sessionOptions?: AgentArchitectureSessionOptions;

  // -------------------------------------------------------------------------
  // Execution environment state
  // -------------------------------------------------------------------------
  private _eeStatus: ExecutionEnvironmentStatus | null = null;
  private _eeId?: string;
  private _eeRestartCount: number = 0;
  private _statusMessage?: string;
  private _lastHealthCheck?: number;
  private _lastError?: ExecutionEnvironmentError;

  // -------------------------------------------------------------------------
  // Query state
  // -------------------------------------------------------------------------
  private _activeQueryStartedAt?: number;

  // -------------------------------------------------------------------------
  // Event bus (optional - for event-driven updates)
  // -------------------------------------------------------------------------
  private readonly _eventBus?: SessionEventBus;

  // =========================================================================
  // Constructor
  // =========================================================================

  constructor(
    init: {
      sessionId: string;
      architecture: AgentArchitecture;
      agentProfileId: string;
      createdAt?: number;
      lastActivity?: number;
      workspaceFiles?: WorkspaceFile[];
      rawTranscript?: string;
      sessionOptions?: AgentArchitectureSessionOptions;
      eeStatus?: ExecutionEnvironmentStatus | null;
      eeId?: string;
      eeRestartCount?: number;
      statusMessage?: string;
      lastHealthCheck?: number;
      lastError?: ExecutionEnvironmentError;
      activeQueryStartedAt?: number;
    },
    eventBus?: SessionEventBus
  ) {
    this._sessionId = init.sessionId;
    this._architecture = init.architecture;
    this._agentProfileId = init.agentProfileId;
    this._createdAt = init.createdAt;
    this._lastActivity = init.lastActivity ?? Date.now();
    this._workspaceFiles = init.workspaceFiles ?? [];
    this._rawTranscript = init.rawTranscript;
    this._sessionOptions = init.sessionOptions;
    this._eeStatus = init.eeStatus ?? null;
    this._eeId = init.eeId;
    this._eeRestartCount = init.eeRestartCount ?? 0;
    this._statusMessage = init.statusMessage;
    this._lastHealthCheck = init.lastHealthCheck;
    this._lastError = init.lastError;
    this._activeQueryStartedAt = init.activeQueryStartedAt;

    // Parse transcript to derive blocks and subagents
    if (init.rawTranscript) {
      const parsed = parseTranscript(init.architecture, init.rawTranscript);
      this._conversationState = {
        blocks: parsed.blocks,
        subagents: parsed.subagents.map((sub) => ({
          agentId: sub.agentId,
          toolUseId: sub.toolUseId, // Use same ID for toolUseId
          blocks: sub.blocks,
          status: 'success' as const, // Transcripts are completed sessions
        })),
        // streaming: { byConversation: new Map() },
      };
    } else {
      this._conversationState = createInitialState();
    }

    // Store event bus and subscribe to events
    this._eventBus = eventBus;
    if (eventBus) {
      this.subscribeToEvents(eventBus);
    }
  }

  // =========================================================================
  // Event Subscriptions
  // =========================================================================

  /**
   * Subscribe to event bus for state updates
   */
  private subscribeToEvents(eventBus: SessionEventBus): void {
    // Use shared reducer for conversation events (blocks, subagents)
    const conversationEventTypes = [
      // Primary events
      'block:upsert',
      'block:delta',
      'subagent:spawned',
      'subagent:completed',
      'session:idle',
    ] as const;

    for (const eventType of conversationEventTypes) {
      // Type assertion needed because TypeScript can't narrow the union type in a loop
      (eventBus as { on: (type: string, cb: (e: AnySessionEvent) => void) => void }).on(
        eventType,
        (event: AnySessionEvent) => {
          this._conversationState = reduceSessionEvent(this._conversationState, event);
        }
      );
    }

    // File events
    eventBus.on('file:created', (event) => {
      this.updateWorkspaceFile(event.payload.file);
    });

    eventBus.on('file:modified', (event) => {
      this.updateWorkspaceFile(event.payload.file);
    });

    eventBus.on('file:deleted', (event) => {
      this.removeWorkspaceFile(event.payload.path);
    });

    // Error events
    eventBus.on('error', (event) => {
      this.setLastError({
        message: event.payload.message,
        code: event.payload.code,
        timestamp: Date.now(),
      });
    });

    // EE lifecycle events
    eventBus.on('ee:creating', (event) => {
      this.setEEStatus('starting');
      if (event.payload.statusMessage) {
        this.setStatusMessage(event.payload.statusMessage);
      }
    });

    eventBus.on('ee:ready', (event) => {
      this.setEEStatus('ready');
      this.setEEId(event.payload.eeId);
      this.setLastHealthCheck(Date.now());
      this.setStatusMessage('Ready');
    });

    eventBus.on('ee:terminated', (event) => {
      this.setEEStatus('terminated');
      this.setEEId(undefined);
      this.setStatusMessage(`Execution environment terminated: ${event.payload.reason}`);
    });

    // Query lifecycle events
    eventBus.on('query:started', () => {
      this.setActiveQueryStartedAt(Date.now());
      this.setLastActivity(Date.now());
    });

    eventBus.on('query:completed', () => {
      this.setActiveQueryStartedAt(undefined);
      this.setLastActivity(Date.now());
    });

    eventBus.on('query:failed', (event) => {
      this.setActiveQueryStartedAt(undefined);
      this.setLastActivity(Date.now());
      this.setLastError({
        message: event.payload.error,
        timestamp: Date.now(),
      });
    });

    // Options events
    eventBus.on('options:update', (event) => {
      this.setSessionOptions(event.payload.options);
    });
  }

  /**
   * Cleanup when session is destroyed
   *
   * Note: Event listeners are cleaned up by SessionEventBus.destroy()
   * which is called by AgentSession. This method exists for any future
   * cleanup needs specific to SessionState.
   */
  destroy(): void {
    // Event listeners are cleaned up by SessionEventBus.destroy()
  }

  // =========================================================================
  // Getters (read-only access)
  // =========================================================================

  get sessionId(): string {
    return this._sessionId;
  }

  get architecture(): AgentArchitecture {
    return this._architecture;
  }

  get agentProfileId(): string {
    return this._agentProfileId;
  }

  get createdAt(): number | undefined {
    return this._createdAt;
  }

  get lastActivity(): number | undefined {
    return this._lastActivity;
  }

  get blocks(): ConversationBlock[] {
    return this._conversationState.blocks;
  }

  get subagents(): SubagentState[] {
    return this._conversationState.subagents;
  }

  get workspaceFiles(): WorkspaceFile[] {
    return this._workspaceFiles;
  }

  get rawTranscript(): string | undefined {
    return this._rawTranscript;
  }

  get sessionOptions(): AgentArchitectureSessionOptions | undefined {
    return this._sessionOptions;
  }

  get eeStatus(): ExecutionEnvironmentStatus | null {
    return this._eeStatus;
  }

  get eeId(): string | undefined {
    return this._eeId;
  }

  get eeRestartCount(): number {
    return this._eeRestartCount;
  }

  get statusMessage(): string | undefined {
    return this._statusMessage;
  }

  get lastHealthCheck(): number | undefined {
    return this._lastHealthCheck;
  }

  get lastError(): ExecutionEnvironmentError | undefined {
    return this._lastError;
  }

  get activeQueryStartedAt(): number | undefined {
    return this._activeQueryStartedAt;
  }

  // =========================================================================
  // Setters (private - called internally or via event handlers)
  // =========================================================================

  private setCreatedAt(value: number): void {
    this._createdAt = value;
  }

  private setLastActivity(value: number): void {
    this._lastActivity = value;
  }

  private setWorkspaceFiles(files: WorkspaceFile[]): void {
    this._workspaceFiles = files;
  }

  private setRawTranscript(transcript: string | undefined): void {
    this._rawTranscript = transcript;
  }

  private setSessionOptions(options: AgentArchitectureSessionOptions | undefined): void {
    this._sessionOptions = options;
  }

  private setEEStatus(status: ExecutionEnvironmentStatus | null): void {
    this._eeStatus = status;
  }

  private setEEId(id: string | undefined): void {
    this._eeId = id;
  }

  private setEERestartCount(count: number): void {
    this._eeRestartCount = count;
  }

  private incrementEERestartCount(): void {
    this._eeRestartCount++;
  }

  private setStatusMessage(message: string | undefined): void {
    this._statusMessage = message;
  }

  private setLastHealthCheck(timestamp: number): void {
    this._lastHealthCheck = timestamp;
  }

  private setLastError(error: ExecutionEnvironmentError | undefined): void {
    this._lastError = error;
  }

  private setActiveQueryStartedAt(timestamp: number | undefined): void {
    this._activeQueryStartedAt = timestamp;
  }

  // =========================================================================
  // State Update Helpers (private)
  // =========================================================================

  /**
   * Update a workspace file (upsert - insert or update)
   */
  private updateWorkspaceFile(file: WorkspaceFile): void {
    const index = this._workspaceFiles.findIndex((f) => f.path === file.path);
    if (index >= 0) {
      this._workspaceFiles[index] = file;
    } else {
      this._workspaceFiles.push(file);
    }
  }

  /**
   * Remove a workspace file
   */
  private removeWorkspaceFile(path: string): void {
    this._workspaceFiles = this._workspaceFiles.filter((f) => f.path !== path);
  }

  // =========================================================================
  // Public Query Methods
  // =========================================================================

  /**
   * Check if a query is currently active
   */
  isQueryActive(): boolean {
    return this._activeQueryStartedAt !== undefined;
  }

  /**
   * Check if execution environment exists
   */
  hasExecutionEnvironment(): boolean {
    return this._eeStatus !== null && this._eeStatus !== 'inactive';
  }

  // =========================================================================
  // Snapshot Methods
  // =========================================================================

  /**
   * Create a serializable snapshot of current state
   */
  toSnapshot(): SessionStateSnapshot {
    return {
      sessionId: this._sessionId,
      architecture: this._architecture,
      agentProfileId: this._agentProfileId,
      createdAt: this._createdAt,
      lastActivity: this._lastActivity,
      blocks: [...this._conversationState.blocks],
      subagents: this._conversationState.subagents.map((s) => ({
        id: s.agentId ?? '',
        blocks: [...s.blocks],
      })),
      workspaceFiles: [...this._workspaceFiles],
      rawTranscript: this._rawTranscript,
      sessionOptions: this._sessionOptions,
      eeStatus: this._eeStatus,
      eeId: this._eeId,
      eeRestartCount: this._eeRestartCount,
      statusMessage: this._statusMessage,
      lastHealthCheck: this._lastHealthCheck,
      lastError: this._lastError,
      activeQueryStartedAt: this._activeQueryStartedAt,
    };
  }

  /**
   * Create a SessionState from a snapshot
   *
   * Note: blocks and subagents are derived from rawTranscript in the constructor,
   * so we don't pass them explicitly. The snapshot stores them for completeness
   * but they're re-parsed from the transcript on restore.
   */
  static fromSnapshot(snapshot: SessionStateSnapshot, eventBus?: SessionEventBus): SessionState {
    return new SessionState({
      sessionId: snapshot.sessionId,
      architecture: snapshot.architecture,
      agentProfileId: snapshot.agentProfileId,
      createdAt: snapshot.createdAt,
      lastActivity: snapshot.lastActivity,
      workspaceFiles: snapshot.workspaceFiles,
      rawTranscript: snapshot.rawTranscript,
      sessionOptions: snapshot.sessionOptions,
      eeStatus: snapshot.eeStatus,
      eeId: snapshot.eeId,
      eeRestartCount: snapshot.eeRestartCount,
      statusMessage: snapshot.statusMessage,
      lastHealthCheck: snapshot.lastHealthCheck,
      lastError: snapshot.lastError,
      activeQueryStartedAt: snapshot.activeQueryStartedAt,
    }, eventBus);
  }

  // =========================================================================
  // Output Methods (for clients/API)
  // =========================================================================

  /**
   * Get runtime state for client status updates
   */
  getRuntimeState(): SessionRuntimeState {
    return {
      isLoaded: true, // If this method is called, session is loaded
      executionEnvironment: this._eeStatus
        ? {
            id: this._eeId,
            status: this._eeStatus,
            statusMessage: this._statusMessage,
            restartCount: this._eeRestartCount,
            lastHealthCheck: this._lastHealthCheck,
            lastError: this._lastError,
          }
        : null,
      activeQuery: this._activeQueryStartedAt
        ? {
            startedAt: this._activeQueryStartedAt,
          }
        : undefined,
    };
  }

  /**
   * Get full session data for clients (RuntimeSessionData format)
   */
  toRuntimeSessionData(): RuntimeSessionData {
    return {
      sessionId: this._sessionId,
      agentProfileReference: this._agentProfileId,
      type: this._architecture,
      createdAt: this._createdAt,
      lastActivity: this._lastActivity,
      sessionOptions: this._sessionOptions,
      runtime: this.getRuntimeState(),
      conversationState: this._conversationState,
      workspaceFiles: this._workspaceFiles,
    };
  }

  /**
   * Get minimal session data for persistence layer list views
   */
  toPersistedListData(): PersistedSessionListData {
    return {
      sessionId: this._sessionId,
      type: this._architecture,
      agentProfileReference: this._agentProfileId,
      sessionOptions: this._sessionOptions,
      lastActivity: this._lastActivity,
      createdAt: this._createdAt,
    };
  }
}
