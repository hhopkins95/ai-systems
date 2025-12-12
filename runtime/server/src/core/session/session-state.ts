/**
 * Session State - Serializable state container for AgentSession
 *
 * Extracts all state management from AgentSession into a dedicated class.
 * Provides snapshot/restore capabilities for persistence and future
 * deployment targets (Durable Objects, etc.)
 *
 * Benefits:
 * - Serializable: toSnapshot()/fromSnapshot() for persistence
 * - Single responsibility: state management separate from coordination
 * - Testable: state logic can be tested in isolation
 * - Portable: state can be moved between hosts
 */

import type {
  AgentArchitecture,
  AgentArchitectureSessionOptions,
  ConversationBlock,
  ExecutionEnvironmentError,
  ExecutionEnvironmentStatus,
  PersistedSessionListData,
  RuntimeSessionData,
  SessionRuntimeState,
  WorkspaceFile,
} from '@ai-systems/shared-types';

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
  private _blocks: ConversationBlock[] = [];
  private _subagents: { id: string; blocks: ConversationBlock[] }[] = [];
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

  // =========================================================================
  // Constructor
  // =========================================================================

  constructor(init: {
    sessionId: string;
    architecture: AgentArchitecture;
    agentProfileId: string;
    createdAt?: number;
    lastActivity?: number;
    blocks?: ConversationBlock[];
    subagents?: { id: string; blocks: ConversationBlock[] }[];
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
  }) {
    this._sessionId = init.sessionId;
    this._architecture = init.architecture;
    this._agentProfileId = init.agentProfileId;
    this._createdAt = init.createdAt;
    this._lastActivity = init.lastActivity ?? Date.now();
    this._blocks = init.blocks ?? [];
    this._subagents = init.subagents ?? [];
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
    return this._blocks;
  }

  get subagents(): { id: string; blocks: ConversationBlock[] }[] {
    return this._subagents;
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
  // Setters (controlled state updates)
  // =========================================================================

  setCreatedAt(value: number): void {
    this._createdAt = value;
  }

  setLastActivity(value: number): void {
    this._lastActivity = value;
  }

  setBlocks(blocks: ConversationBlock[]): void {
    this._blocks = blocks;
  }

  setSubagents(subagents: { id: string; blocks: ConversationBlock[] }[]): void {
    this._subagents = subagents;
  }

  setWorkspaceFiles(files: WorkspaceFile[]): void {
    this._workspaceFiles = files;
  }

  setRawTranscript(transcript: string | undefined): void {
    this._rawTranscript = transcript;
  }

  setSessionOptions(options: AgentArchitectureSessionOptions | undefined): void {
    this._sessionOptions = options;
  }

  setEEStatus(status: ExecutionEnvironmentStatus | null): void {
    this._eeStatus = status;
  }

  setEEId(id: string | undefined): void {
    this._eeId = id;
  }

  setEERestartCount(count: number): void {
    this._eeRestartCount = count;
  }

  incrementEERestartCount(): void {
    this._eeRestartCount++;
  }

  setStatusMessage(message: string | undefined): void {
    this._statusMessage = message;
  }

  setLastHealthCheck(timestamp: number): void {
    this._lastHealthCheck = timestamp;
  }

  setLastError(error: ExecutionEnvironmentError | undefined): void {
    this._lastError = error;
  }

  setActiveQueryStartedAt(timestamp: number | undefined): void {
    this._activeQueryStartedAt = timestamp;
  }

  // =========================================================================
  // State Update Helpers
  // =========================================================================

  /**
   * Update a workspace file (upsert - insert or update)
   */
  updateWorkspaceFile(file: WorkspaceFile): void {
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
  removeWorkspaceFile(path: string): void {
    this._workspaceFiles = this._workspaceFiles.filter((f) => f.path !== path);
  }

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
      blocks: [...this._blocks],
      subagents: this._subagents.map((s) => ({
        id: s.id,
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
   */
  static fromSnapshot(snapshot: SessionStateSnapshot): SessionState {
    return new SessionState({
      sessionId: snapshot.sessionId,
      architecture: snapshot.architecture,
      agentProfileId: snapshot.agentProfileId,
      createdAt: snapshot.createdAt,
      lastActivity: snapshot.lastActivity,
      blocks: snapshot.blocks,
      subagents: snapshot.subagents,
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
    });
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
      blocks: this._blocks,
      workspaceFiles: this._workspaceFiles,
      subagents: this._subagents.map((s) => ({
        id: s.id,
        blocks: s.blocks,
      })),
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
