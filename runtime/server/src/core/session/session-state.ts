/**
 * Session State - Event-driven state container for AgentSession
 *
 * Manages session state using the shared reducer from @ai-systems/state.
 * Subscribes to the event bus for updates and provides access to state slices.
 *
 * State is split into:
 * - Shared state (conversation, EE, runtime) - managed by reduceSessionState
 * - Server-specific state (workspace files, transcript, options)
 */

import type {
  AgentArchitecture,
  AgentArchitectureSessionOptions,
  AnySessionEvent,
  SessionConversationState,
  ExecutionEnvironmentState,
  RuntimeState,
  SessionState as SharedSessionState,
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
  readonly sessionId: string;
  readonly architecture: AgentArchitecture;
  readonly agentProfileId: string;

  // Shared state (managed by reduceSessionState from @ai-systems/state)
  private _sharedState: SharedSessionState;

  // Server-specific mutable state
  private _createdAt: number;
  private _lastActivity: number;
  private _workspaceFiles: WorkspaceFile[];
  private _rawTranscript?: string;
  private _sessionOptions?: AgentArchitectureSessionOptions;

  constructor(init: SessionStateInit, eventBus?: SessionEventBus) {
    // Identifiers
    this.sessionId = init.sessionId;
    this.architecture = init.architecture;
    this.agentProfileId = init.agentProfileId;

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
    if (eventBus) {
      this.subscribeToEvents(eventBus);
    }
  }

  // =========================================================================
  // Event Subscriptions
  // =========================================================================

  private subscribeToEvents(eventBus: SessionEventBus): void {
    const allEventTypes = [
      'block:upsert', 'block:delta', 'subagent:spawned', 'subagent:completed',
      'session:idle', 'session:initialized',
      'ee:creating', 'ee:ready', 'ee:terminated', 'ee:error', 'ee:health_check',
      'query:started', 'query:completed', 'query:failed',
      'file:created', 'file:modified', 'file:deleted', 'options:update', 'error',
    ] as const;

    for (const eventType of allEventTypes) {
      (eventBus as { on: (type: string, cb: (e: AnySessionEvent) => void) => void }).on(
        eventType,
        (event: AnySessionEvent) => this.handleEvent(event)
      );
    }
  }

  private handleEvent(event: AnySessionEvent): void {
    // Update shared state via reducer
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
    }

    // Update activity timestamp
    if (['query:started', 'query:completed', 'query:failed'].includes(event.type)) {
      this._lastActivity = Date.now();
    }
  }

  destroy(): void {
    // Event listeners are cleaned up by SessionEventBus.destroy()
  }

  // =========================================================================
  // Shared State Accessors
  // =========================================================================

  getConversationState(): SessionConversationState {
    return this._sharedState.conversation;
  }

  getRuntimeState(): RuntimeState {
    return this._sharedState.runtime;
  }

  getExecutionEnvironmentState(): ExecutionEnvironmentState {
    return this._sharedState.executionEnvironment;
  }

  // =========================================================================
  // Server-specific State Accessors
  // =========================================================================

  get createdAt(): number {
    return this._createdAt;
  }

  get lastActivity(): number {
    return this._lastActivity;
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

  // =========================================================================
  // Private Helpers
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
