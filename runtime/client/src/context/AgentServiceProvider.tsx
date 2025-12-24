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
    // Most events dispatch SESSION_EVENT to the reducer, which uses the shared
    // reducer for conversation state. Special cases have dedicated handling.
    // =========================================================================

    wsManager.on('session:event', (event: AnySessionEvent) => {
      const { type, payload, context } = event;
      const sessionId = context.sessionId;

      // Log all events for debugging
      logEvent(type, event);
      dispatch({ type: 'EVENT_LOGGED', eventName: `session:${type}`, payload: event });

      // Handle special cases that need different action types
      switch (type) {
        // Status events update runtime state (not conversation state)
        case 'status':
          dispatch({
            type: 'SESSION_RUNTIME_UPDATED',
            sessionId,
            runtime: payload.runtime,
          });
          return;

        // Options events update session options (not conversation state)
        case 'options:update':
          dispatch({
            type: 'SESSION_OPTIONS_UPDATED',
            sessionId,
            sessionOptions: payload.options,
          });
          return;

        // Error events add error blocks to conversation (special handling)
        case 'error':
          dispatch({
            type: 'ERROR_BLOCK_ADDED',
            sessionId,
            error: {
              message: payload.message,
              code: payload.code,
            },
          });
          return;

        // block:complete with user_message replaces optimistic message
        case 'block:upsert':
          if (payload.block.type === 'user_message') {
            dispatch({
              type: 'REPLACE_OPTIMISTIC_USER_MESSAGE',
              sessionId,
              block: payload.block,
            });
            return;
          }
          // Fall through to SESSION_EVENT for non-user_message blocks
          break;

        // Transcript events are server-side only
        case 'transcript:changed':
        case 'transcript:written':
          return;

        // Session initialized is informational
        case 'session:initialized':
          return;

        // Query lifecycle is informational (runtime status tracks query state)
        case 'query:started':
        case 'query:completed':
        case 'query:failed':
          return;
      }

      // All other events go through SESSION_EVENT, which uses the shared reducer
      // for conversation events (blocks, subagents) and handles file/log/EE events
      dispatch({
        type: 'SESSION_EVENT',
        sessionId,
        event,
      });
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
