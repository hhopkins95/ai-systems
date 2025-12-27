/**
 * Session State - Event-driven state container for AgentSession
 *
 * Manages session state using the shared reducer from @ai-systems/state.
 * Subscribes to the event bus for updates and provides getters for state access.
 *
 * State is split into:
 * - Shared state (conversation, EE, runtime) - managed by reduceSessionState
 * - Server-specific state (workspace files, transcript, options)
 */

import type {
  AgentArchitecture,
  AgentArchitectureSessionOptions,
  AnySessionEvent,
  ConversationBlock,
  ExecutionEnvironmentStatus,
  ExecutionEnvironmentError,
  SessionState as SharedSessionState,
  SubagentState,
  WorkspaceFile,
} from '@ai-systems/shared-types';
import {
  parseTranscript,
  reduceSessionState,
  createInitialSessionState,
} from '@ai-systems/state';
import type { SessionEventBus } from './session-event-bus.js';

// ============================================================================
// Init Types
// ============================================================================

export interface SessionStateInit {
  sessionId: string;
  architecture: AgentArchitecture;
  agentProfileId: string;
  workspaceFiles?: WorkspaceFile[];
  sessionOptions?: AgentArchitectureSessionOptions;
  createdAt?: number;
  rawTranscript?: string;
}

// ============================================================================
// SessionState Class
// ============================================================================

export class SessionState {
  // Server-specific identifiers (immutable)
  private readonly _sessionId: string;
  private readonly _architecture: AgentArchitecture;
  private readonly _agentProfileId: string;

  // Shared state (managed by reduceSessionState from @ai-systems/state)
  private _sharedState: SharedSessionState;

  // Server-specific mutable state
  private _createdAt: number;
  private _lastActivity: number;
  private _workspaceFiles: WorkspaceFile[];
  private _rawTranscript?: string;
  private _sessionOptions?: AgentArchitectureSessionOptions;

  // Event bus (optional)
  private readonly _eventBus?: SessionEventBus;

  constructor(init: SessionStateInit, eventBus?: SessionEventBus) {
    // Identifiers
    this._sessionId = init.sessionId;
    this._architecture = init.architecture;
    this._agentProfileId = init.agentProfileId;

    // Server-specific state
    this._createdAt = init.createdAt ?? Date.now();
    this._lastActivity = Date.now();
    this._workspaceFiles = init.workspaceFiles ?? [];
    this._rawTranscript = init.rawTranscript;
    this._sessionOptions = init.sessionOptions;

    // Initialize shared state
    if (init.rawTranscript) {
      const parsed = parseTranscript(init.architecture, init.rawTranscript);
      this._sharedState = {
        conversation: parsed,
        executionEnvironment: { status: 'inactive' },
        runtime: { isLoaded: true },
      };
    } else {
      this._sharedState = createInitialSessionState();
    }

    // Subscribe to events
    this._eventBus = eventBus;
    if (eventBus) {
      this.subscribeToEvents(eventBus);
    }
  }

  // =========================================================================
  // Event Subscriptions
  // =========================================================================

  private subscribeToEvents(eventBus: SessionEventBus): void {
    const allEventTypes = [
      // Conversation events (handled by shared reducer)
      'block:upsert',
      'block:delta',
      'subagent:spawned',
      'subagent:completed',
      'session:idle',
      'session:initialized',
      // EE lifecycle events (handled by shared reducer)
      'ee:creating',
      'ee:ready',
      'ee:terminated',
      'ee:error',
      'ee:health_check',
      // Query events (handled by shared reducer)
      'query:started',
      'query:completed',
      'query:failed',
      // Server-specific events
      'file:created',
      'file:modified',
      'file:deleted',
      'options:update',
      'error',
    ] as const;

    for (const eventType of allEventTypes) {
      (eventBus as { on: (type: string, cb: (e: AnySessionEvent) => void) => void }).on(
        eventType,
        (event: AnySessionEvent) => this.handleEvent(event)
      );
    }
  }

  private handleEvent(event: AnySessionEvent): void {
    // Update shared state via reducer (handles conversation, EE, runtime)
    this._sharedState = reduceSessionState(this._sharedState, event);

    // Handle server-specific events
    switch (event.type) {
      case 'file:created':
      case 'file:modified':
        this.updateWorkspaceFile(event.payload.file);
        break;
      case 'file:deleted':
        this.removeWorkspaceFile(event.payload.path);
        break;
      case 'options:update':
        this._sessionOptions = event.payload.options;
        break;
      case 'error':
        // Error is handled by EE reducer, but update lastActivity
        break;
    }

    // Update activity timestamp for relevant events
    if (['query:started', 'query:completed', 'query:failed'].includes(event.type)) {
      this._lastActivity = Date.now();
    }
  }

  destroy(): void {
    // Event listeners are cleaned up by SessionEventBus.destroy()
  }

  // =========================================================================
  // Getters - Identifiers
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

  // =========================================================================
  // Getters - Timestamps
  // =========================================================================

  get createdAt(): number | undefined {
    return this._createdAt;
  }

  get lastActivity(): number | undefined {
    return this._lastActivity;
  }

  // =========================================================================
  // Getters - Conversation (delegated to shared state)
  // =========================================================================

  get blocks(): ConversationBlock[] {
    return this._sharedState.conversation.blocks;
  }

  get subagents(): SubagentState[] {
    return this._sharedState.conversation.subagents;
  }

  // =========================================================================
  // Getters - Execution Environment (delegated to shared state)
  // =========================================================================

  get eeStatus(): ExecutionEnvironmentStatus | null {
    const status = this._sharedState.executionEnvironment.status;
    return status === 'inactive' ? null : status;
  }

  get eeId(): string | undefined {
    return this._sharedState.executionEnvironment.id;
  }

  get eeRestartCount(): number {
    return this._sharedState.executionEnvironment.restartCount ?? 0;
  }

  get statusMessage(): string | undefined {
    return this._sharedState.executionEnvironment.statusMessage;
  }

  get lastHealthCheck(): number | undefined {
    return this._sharedState.executionEnvironment.lastHealthCheck;
  }

  get lastError(): ExecutionEnvironmentError | undefined {
    return this._sharedState.executionEnvironment.lastError;
  }

  // =========================================================================
  // Getters - Server-specific state
  // =========================================================================

  get workspaceFiles(): WorkspaceFile[] {
    return this._workspaceFiles;
  }

  get rawTranscript(): string | undefined {
    return this._rawTranscript;
  }

  get sessionOptions(): AgentArchitectureSessionOptions | undefined {
    return this._sessionOptions;
  }

  // =========================================================================
  // Query state (delegated to shared state)
  // =========================================================================

  get activeQueryStartedAt(): number | undefined {
    return this._sharedState.runtime.activeQuery?.startedAt;
  }

  isQueryActive(): boolean {
    return this._sharedState.runtime.activeQuery !== undefined;
  }

  hasExecutionEnvironment(): boolean {
    const status = this._sharedState.executionEnvironment.status;
    return status !== 'inactive';
  }

  // =========================================================================
  // State Update Helpers (private)
  // =========================================================================

  private updateWorkspaceFile(file: WorkspaceFile): void {
    const index = this._workspaceFiles.findIndex((f) => f.path === file.path);
    if (index >= 0) {
      this._workspaceFiles[index] = file;
    } else {
      this._workspaceFiles.push(file);
    }
  }

  private removeWorkspaceFile(path: string): void {
    this._workspaceFiles = this._workspaceFiles.filter((f) => f.path !== path);
  }
}
