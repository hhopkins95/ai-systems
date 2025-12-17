/**
 * Agent Service Provider Component
 *
 * Root provider that manages WebSocket connection, REST client,
 * and global state for all agent sessions.
 */

import { useEffect, useReducer, useRef, type ReactNode } from 'react';
import type { AnySessionEvent } from '@ai-systems/shared-types';
import { RestClient } from '../client/rest';
import { WebSocketManager } from '../client/websocket';
import { AgentServiceContext } from './AgentServiceContext';
import { agentServiceReducer, initialState } from './reducer';

interface AgentServiceProviderProps {
  /**
   * Base URL for REST API (e.g., "http://localhost:3002")
   */
  apiUrl: string;

  /**
   * WebSocket server URL (e.g., "http://localhost:3003")
   */
  wsUrl: string;

  /**
   * API key for authentication
   */
  apiKey: string;

  /**
   * Enable debug logging
   */
  debug?: boolean;

  /**
   * Child components
   */
  children: ReactNode;
}

export function AgentServiceProvider({
  apiUrl,
  wsUrl,
  apiKey,
  debug = false,
  children,
}: AgentServiceProviderProps) {
  const [state, dispatch] = useReducer(agentServiceReducer, initialState);

  // Client instances (stable references)
  const restClientRef = useRef<RestClient | null>(null);
  const wsManagerRef = useRef<WebSocketManager | null>(null);

  // Initialize clients
  if (!restClientRef.current) {
    restClientRef.current = new RestClient(apiUrl, apiKey, debug);
  }
  if (!wsManagerRef.current) {
    wsManagerRef.current = new WebSocketManager(wsUrl, debug);
  }

  const restClient = restClientRef.current;
  const wsManager = wsManagerRef.current;

  // Initialize: Connect WebSocket and load session list
  useEffect(() => {
    // Connect WebSocket immediately (before any async operations)
    // This ensures the socket exists when event listeners are registered
    wsManager.connect();

    async function loadInitialData() {
      try {
        // Load initial session list
        const sessions = await restClient.listSessions();
        dispatch({ type: 'INITIALIZE', sessions });
      } catch (error) {
        console.error('[AgentServiceProvider] Initialization failed:', error);
      }
    }

    loadInitialData();

    return () => {
      // Cleanup on unmount
      wsManager.disconnect();
    };
  }, []);

  // Set up WebSocket event listeners
  useEffect(() => {
    // Helper to log events when debug mode is enabled
    const logEvent = (eventType: string, data: unknown) => {
      if (debug) {
        console.log(`[WS Event] session:event:${eventType}`, data);
      }
    };

    // =========================================================================
    // Unified Session Event Handler
    // =========================================================================

    wsManager.on('session:event', (event: AnySessionEvent) => {
      const { type, payload, context } = event;
      const sessionId = context.sessionId;
      const conversationId = context.conversationId ?? 'main';

      // Log the event
      logEvent(type, event);
      dispatch({ type: 'EVENT_LOGGED', eventName: `session:${type}`, payload: event });

      // Handle each event type
      switch (type) {
        // Block Streaming Events
        case 'block:start':
          dispatch({
            type: 'STREAM_STARTED',
            sessionId,
            conversationId,
            block: payload.block,
          });
          break;

        case 'block:delta':
          dispatch({
            type: 'STREAM_DELTA',
            sessionId,
            conversationId,
            blockId: payload.blockId,
            delta: payload.delta,
          });
          break;

        case 'block:update':
          dispatch({
            type: 'BLOCK_UPDATED',
            sessionId,
            conversationId,
            blockId: payload.blockId,
            updates: payload.updates,
          });
          break;

        case 'block:complete':
          // Handle user_message blocks specially - replace optimistic message
          if (payload.block.type === 'user_message') {
            dispatch({
              type: 'REPLACE_OPTIMISTIC_USER_MESSAGE',
              sessionId,
              block: payload.block,
            });
          } else {
            dispatch({
              type: 'STREAM_COMPLETED',
              sessionId,
              conversationId,
              blockId: payload.blockId,
              block: payload.block,
            });
          }
          break;

        // Metadata Events
        case 'metadata:update':
          dispatch({
            type: 'METADATA_UPDATED',
            sessionId,
            conversationId,
            metadata: payload.metadata,
          });
          break;

        // Status Events
        case 'status':
          dispatch({
            type: 'SESSION_RUNTIME_UPDATED',
            sessionId,
            runtime: payload.runtime,
          });
          break;

        // File Events
        case 'file:created':
          dispatch({
            type: 'FILE_CREATED',
            sessionId,
            file: payload.file,
          });
          break;

        case 'file:modified':
          dispatch({
            type: 'FILE_MODIFIED',
            sessionId,
            file: payload.file,
          });
          break;

        case 'file:deleted':
          dispatch({
            type: 'FILE_DELETED',
            sessionId,
            path: payload.path,
          });
          break;

        // Subagent Events
        case 'subagent:discovered':
          dispatch({
            type: 'SUBAGENT_DISCOVERED',
            sessionId,
            subagent: payload.subagent,
          });
          break;

        case 'subagent:completed':
          dispatch({
            type: 'SUBAGENT_COMPLETED',
            sessionId,
            subagentId: payload.subagentId,
            status: payload.status,
          });
          break;

        // Log Events
        case 'log':
          dispatch({
            type: 'SESSION_LOG_RECEIVED',
            sessionId,
            log: {
              level: payload.level,
              message: payload.message,
              data: payload.data,
            },
          });
          break;

        // Error Events
        case 'error':
          dispatch({
            type: 'ERROR_BLOCK_ADDED',
            sessionId,
            error: {
              message: payload.message,
              code: payload.code,
            },
          });
          break;

        // Options Events
        case 'options:update':
          dispatch({
            type: 'SESSION_OPTIONS_UPDATED',
            sessionId,
            sessionOptions: payload.options,
          });
          break;

        // Transcript Events (internal, not typically needed by UI)
        case 'transcript:changed':
          // Transcript changes are handled server-side for persistence
          // Client typically doesn't need to handle these
          break;

        default: {
          // TypeScript exhaustiveness check
          const _exhaustive: never = type;
          console.warn('[AgentService] Unhandled event type:', _exhaustive);
        }
      }
    });

    // =========================================================================
    // Connection-level Error Events
    // =========================================================================

    wsManager.on('error', (error) => {
      console.error('[AgentService] WebSocket error:', error);
      dispatch({ type: 'EVENT_LOGGED', eventName: 'error', payload: error });

      // Add error as inline block in conversation if sessionId is provided
      if (error.sessionId) {
        dispatch({
          type: 'ERROR_BLOCK_ADDED',
          sessionId: error.sessionId,
          error: {
            message: error.message,
            code: error.code,
          },
        });
      }
    });

    // Cleanup: Remove all listeners on unmount
    return () => {
      wsManager.removeAllListeners();
    };
  }, [wsManager, debug]);

  const contextValue = {
    state,
    dispatch,
    restClient,
    wsManager,
  };

  return (
    <AgentServiceContext.Provider value={contextValue}>
      {children}
    </AgentServiceContext.Provider>
  );
}
