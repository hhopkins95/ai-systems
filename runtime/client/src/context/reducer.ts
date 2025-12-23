/**
 * State Reducer for Agent Service Client
 *
 * Manages global state for all sessions using the shared reducer pattern
 * from @hhopkins/agent-converters for conversation state.
 *
 * State managed:
 * - Session list
 * - Conversation state (blocks, subagents) - via shared reducer
 * - Workspace files
 * - Metadata (tokens, cost)
 * - Session logs
 * - EE status
 */

import type {
  SessionListItem,
  SessionRuntimeState,
  RuntimeSessionData,
  ConversationBlock,
  UserMessageBlock,
  ErrorBlock,
  WorkspaceFile,
  SessionMetadata,
  AgentArchitectureSessionOptions,
  AnySessionEvent,
  SessionConversationState,
  PartialConversationBlock,
} from '@ai-systems/shared-types';
import {
  reduceSessionEvent,
  createInitialState as createInitialConversationState,
} from '@hhopkins/agent-converters';

// ============================================================================
// Debug Event Types
// ============================================================================

export interface DebugEvent {
  id: string;
  timestamp: number;
  eventName: string;
  payload: unknown;
}

const MAX_EVENT_LOG_SIZE = 100;

// ============================================================================
// Session Log Types
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// ============================================================================
// EE Status Types
// ============================================================================

/**
 * Execution environment status
 * - creating: EE is being set up
 * - ready: EE is ready for queries
 * - terminated: EE has been shut down
 * - null: No EE status known
 */
export type EEStatus = 'creating' | 'ready' | 'terminated' | null;

export interface SessionLogEntry {
  id: string;
  timestamp: number;
  sessionId: string;
  level: LogLevel;
  message: string;
  data?: Record<string, unknown>;
}

const MAX_SESSION_LOG_SIZE = 500;

// ============================================================================
// State Shape
// ============================================================================

export interface SessionState {
  /** Session info including runtime state */
  info: SessionListItem;

  /** Conversation state (blocks, subagents) managed by shared reducer */
  conversationState: SessionConversationState;

  /** Session-level metadata (tokens, cost, model) */
  metadata: SessionMetadata;

  /** Workspace files tracked by the session */
  files: WorkspaceFile[];

  /** Session logs from execution environment */
  logs: SessionLogEntry[];

  /** Execution environment status */
  eeStatus: EEStatus;

  /** Loading state for async operations */
  isLoading: boolean;
}

export interface AgentServiceState {
  /** Full session data indexed by sessionId */
  sessions: Map<string, SessionState>;

  /** Lightweight session list for UI (session picker, etc.) */
  sessionList: SessionListItem[];

  /** Whether initial data has been loaded */
  isInitialized: boolean;

  /** Debug event log (newest first) */
  eventLog: DebugEvent[];
}

// ============================================================================
// Action Types
// ============================================================================

export type AgentServiceAction =
  // Initialization
  | { type: 'INITIALIZE'; sessions: SessionListItem[] }

  // Session List
  | { type: 'SESSIONS_LIST_UPDATED'; sessions: SessionListItem[] }

  // Session CRUD
  | { type: 'SESSION_CREATED'; session: SessionListItem }
  | { type: 'SESSION_LOADED'; sessionId: string; data: RuntimeSessionData }
  | { type: 'SESSION_DESTROYED'; sessionId: string }

  // Session Runtime
  | { type: 'SESSION_RUNTIME_UPDATED'; sessionId: string; runtime: SessionRuntimeState }

  // Session Options
  | { type: 'SESSION_OPTIONS_UPDATED'; sessionId: string; sessionOptions: AgentArchitectureSessionOptions }

  // Unified Session Event - handles all conversation events via shared reducer
  | { type: 'SESSION_EVENT'; sessionId: string; event: AnySessionEvent }

  // Debug Events
  | { type: 'EVENT_LOGGED'; eventName: string; payload: unknown }
  | { type: 'EVENTS_CLEARED' }

  // Optimistic Message Updates (client-specific)
  | { type: 'OPTIMISTIC_USER_MESSAGE'; sessionId: string; block: UserMessageBlock }
  | { type: 'REPLACE_OPTIMISTIC_USER_MESSAGE'; sessionId: string; block: PartialConversationBlock }
  | { type: 'REMOVE_OPTIMISTIC_MESSAGE'; sessionId: string; optimisticId: string }

  // Error Display (client-specific)
  | { type: 'ERROR_BLOCK_ADDED'; sessionId: string; error: { message: string; code?: string } }

  // Session Logs
  | { type: 'SESSION_LOG_RECEIVED'; sessionId: string; log: { level?: LogLevel; message: string; data?: Record<string, unknown> } }
  | { type: 'SESSION_LOGS_CLEARED'; sessionId: string }

  // EE Lifecycle
  | { type: 'EE_STATUS_CHANGED'; sessionId: string; status: EEStatus; eeId?: string };

// ============================================================================
// Initial State
// ============================================================================

export const initialState: AgentServiceState = {
  sessions: new Map(),
  sessionList: [],
  isInitialized: false,
  eventLog: [],
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Upsert a file in the files array
 */
function upsertFile(files: WorkspaceFile[], file: WorkspaceFile): WorkspaceFile[] {
  const existingIndex = files.findIndex((f) => f.path === file.path);
  if (existingIndex >= 0) {
    const newFiles = [...files];
    newFiles[existingIndex] = file;
    return newFiles;
  }
  return [...files, file];
}

/**
 * Append a log entry, keeping only MAX_SESSION_LOG_SIZE most recent
 */
function appendLog(
  logs: SessionLogEntry[],
  sessionId: string,
  log: { level?: LogLevel; message: string; data?: Record<string, unknown> }
): SessionLogEntry[] {
  const newLog: SessionLogEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: Date.now(),
    sessionId,
    level: log.level ?? 'info',
    message: log.message,
    data: log.data,
  };
  return [...logs, newLog].slice(-MAX_SESSION_LOG_SIZE);
}

// ============================================================================
// Reducer
// ============================================================================

export function agentServiceReducer(
  state: AgentServiceState,
  action: AgentServiceAction
): AgentServiceState {
  switch (action.type) {
    case 'INITIALIZE': {
      return {
        ...state,
        sessionList: action.sessions,
        isInitialized: true,
      };
    }

    case 'SESSIONS_LIST_UPDATED': {
      // Also update runtime state in loaded sessions
      const sessions = new Map(state.sessions);
      for (const sessionInfo of action.sessions) {
        const existing = sessions.get(sessionInfo.sessionId);
        if (existing) {
          sessions.set(sessionInfo.sessionId, {
            ...existing,
            info: sessionInfo,
          });
        }
      }

      return {
        ...state,
        sessionList: action.sessions,
        sessions,
      };
    }

    case 'SESSION_CREATED': {
      // Check if session already exists (race condition with SESSIONS_LIST_UPDATED)
      const exists = state.sessionList.some((s) => s.sessionId === action.session.sessionId);

      const newSessionList = exists
        ? state.sessionList.map((s) =>
            s.sessionId === action.session.sessionId ? action.session : s
          )
        : [...state.sessionList, action.session];

      // Initialize session state
      const sessions = new Map(state.sessions);
      const existingSession = sessions.get(action.session.sessionId);
      sessions.set(action.session.sessionId, {
        info: action.session,
        conversationState: existingSession?.conversationState ?? createInitialConversationState(),
        metadata: existingSession?.metadata ?? {},
        files: existingSession?.files ?? [],
        logs: existingSession?.logs ?? [],
        eeStatus: existingSession?.eeStatus ?? null,
        isLoading: existingSession?.isLoading ?? false,
      });

      return {
        ...state,
        sessionList: newSessionList,
        sessions,
      };
    }

    case 'SESSION_LOADED': {
      const sessions = new Map(state.sessions);

      sessions.set(action.sessionId, {
        info: action.data,
        conversationState: action.data.conversationState,
        metadata: {},
        files: action.data.workspaceFiles,
        logs: [],
        eeStatus: null,
        isLoading: false,
      });

      return {
        ...state,
        sessions,
      };
    }

    case 'SESSION_DESTROYED': {
      const sessions = new Map(state.sessions);
      sessions.delete(action.sessionId);

      return {
        ...state,
        sessions,
        sessionList: state.sessionList.filter((s) => s.sessionId !== action.sessionId),
      };
    }

    case 'SESSION_RUNTIME_UPDATED': {
      const sessions = new Map(state.sessions);
      const session = sessions.get(action.sessionId);

      if (session) {
        sessions.set(action.sessionId, {
          ...session,
          info: {
            ...session.info,
            runtime: action.runtime,
          },
        });
      }

      return {
        ...state,
        sessions,
        sessionList: state.sessionList.map((s) =>
          s.sessionId === action.sessionId ? { ...s, runtime: action.runtime } : s
        ),
      };
    }

    case 'SESSION_OPTIONS_UPDATED': {
      const sessions = new Map(state.sessions);
      const session = sessions.get(action.sessionId);

      if (session) {
        sessions.set(action.sessionId, {
          ...session,
          info: {
            ...session.info,
            sessionOptions: action.sessionOptions,
          },
        });
      }

      return {
        ...state,
        sessions,
        sessionList: state.sessionList.map((s) =>
          s.sessionId === action.sessionId ? { ...s, sessionOptions: action.sessionOptions } : s
        ),
      };
    }

    // =========================================================================
    // Unified Session Event Handler
    // Uses shared reducer for conversation events (blocks, subagents)
    // Handles other events (files, metadata, logs, EE status) directly
    // =========================================================================
    case 'SESSION_EVENT': {
      const { sessionId, event } = action;
      const session = state.sessions.get(sessionId);
      if (!session) return state;

      // Use shared reducer for conversation events (blocks, subagents)
      const newConversationState = reduceSessionEvent(session.conversationState, event);

      // Handle non-conversation events
      let newFiles = session.files;
      let newLogs = session.logs;
      let newMetadata = session.metadata;
      let newEEStatus = session.eeStatus;

      switch (event.type) {
        case 'file:created':
        case 'file:modified':
          newFiles = upsertFile(session.files, event.payload.file);
          break;
        case 'file:deleted':
          newFiles = session.files.filter((f) => f.path !== event.payload.path);
          break;
        case 'metadata:update':
          newMetadata = { ...session.metadata, ...event.payload.metadata };
          break;
        case 'log':
          newLogs = appendLog(session.logs, sessionId, event.payload);
          break;
        case 'ee:creating':
          newEEStatus = 'creating';
          break;
        case 'ee:ready':
          newEEStatus = 'ready';
          break;
        case 'ee:terminated':
          newEEStatus = 'terminated';
          break;
      }

      const sessions = new Map(state.sessions);
      sessions.set(sessionId, {
        ...session,
        conversationState: newConversationState,
        files: newFiles,
        logs: newLogs,
        metadata: newMetadata,
        eeStatus: newEEStatus,
      });
      return { ...state, sessions };
    }

    case 'EVENT_LOGGED': {
      const newEvent: DebugEvent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        timestamp: Date.now(),
        eventName: action.eventName,
        payload: action.payload,
      };

      // Prepend new event, keep only the most recent MAX_EVENT_LOG_SIZE
      const newEventLog = [newEvent, ...state.eventLog].slice(0, MAX_EVENT_LOG_SIZE);

      return {
        ...state,
        eventLog: newEventLog,
      };
    }

    case 'EVENTS_CLEARED': {
      return {
        ...state,
        eventLog: [],
      };
    }

    case 'OPTIMISTIC_USER_MESSAGE': {
      const sessions = new Map(state.sessions);
      const session = sessions.get(action.sessionId);

      if (!session) return state;

      // Add optimistic block to conversation state
      sessions.set(action.sessionId, {
        ...session,
        conversationState: {
          ...session.conversationState,
          blocks: [...session.conversationState.blocks, action.block],
        },
      });

      return { ...state, sessions };
    }

    case 'REPLACE_OPTIMISTIC_USER_MESSAGE': {
      const sessions = new Map(state.sessions);
      const session = sessions.get(action.sessionId);

      if (!session) return state;

      // Create full block from partial with defaults
      const partialBlock = action.block;
      const fullBlock: ConversationBlock = {
        timestamp: new Date().toISOString(),
        status: 'complete',
        ...partialBlock,
      } as ConversationBlock;

      // Find optimistic block with matching content (user_message type, optimistic- prefix)
      const blocks = session.conversationState.blocks;
      const incomingContent = 'content' in partialBlock ? partialBlock.content : undefined;
      const optimisticIndex = blocks.findIndex(
        (block) =>
          block.type === 'user_message' &&
          block.id.startsWith('optimistic-') &&
          incomingContent !== undefined &&
          block.content === incomingContent
      );

      let newBlocks: ConversationBlock[];
      if (optimisticIndex >= 0) {
        // Replace optimistic with real block
        newBlocks = [...blocks];
        newBlocks[optimisticIndex] = fullBlock;
      } else {
        // No optimistic block found, just append (edge case)
        newBlocks = [...blocks, fullBlock];
      }

      sessions.set(action.sessionId, {
        ...session,
        conversationState: {
          ...session.conversationState,
          blocks: newBlocks,
        },
      });

      return { ...state, sessions };
    }

    case 'REMOVE_OPTIMISTIC_MESSAGE': {
      const sessions = new Map(state.sessions);
      const session = sessions.get(action.sessionId);

      if (!session) return state;

      sessions.set(action.sessionId, {
        ...session,
        conversationState: {
          ...session.conversationState,
          blocks: session.conversationState.blocks.filter(
            (block) => block.id !== action.optimisticId
          ),
        },
      });

      return { ...state, sessions };
    }

    case 'ERROR_BLOCK_ADDED': {
      const sessions = new Map(state.sessions);
      const session = sessions.get(action.sessionId);

      if (!session) return state;

      const errorBlock: ErrorBlock = {
        id: `error-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        type: 'error',
        timestamp: new Date().toISOString(),
        message: action.error.message,
        code: action.error.code,
      };

      sessions.set(action.sessionId, {
        ...session,
        conversationState: {
          ...session.conversationState,
          blocks: [...session.conversationState.blocks, errorBlock],
        },
      });

      return { ...state, sessions };
    }

    case 'SESSION_LOG_RECEIVED': {
      const sessions = new Map(state.sessions);
      const session = sessions.get(action.sessionId);

      if (!session) return state;

      sessions.set(action.sessionId, {
        ...session,
        logs: appendLog(session.logs, action.sessionId, action.log),
      });

      return { ...state, sessions };
    }

    case 'SESSION_LOGS_CLEARED': {
      const sessions = new Map(state.sessions);
      const session = sessions.get(action.sessionId);

      if (!session) return state;

      sessions.set(action.sessionId, {
        ...session,
        logs: [],
      });

      return { ...state, sessions };
    }

    case 'EE_STATUS_CHANGED': {
      const sessions = new Map(state.sessions);
      const session = sessions.get(action.sessionId);

      if (!session) return state;

      sessions.set(action.sessionId, {
        ...session,
        eeStatus: action.status,
      });

      return { ...state, sessions };
    }

    default:
      return state;
  }
}
