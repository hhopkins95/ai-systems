/**
 * useMessages Hook
 *
 * Access conversation blocks and send messages to the agent.
 * Provides real-time streaming updates for the main conversation.
 *
 * Blocks with status === 'pending' are currently streaming.
 * Content accumulates directly in block.content via the shared reducer.
 */

import { useContext, useCallback, useState, useMemo } from 'react';
import { AgentServiceContext } from '../context/AgentServiceContext';
import type { ConversationBlock, UserMessageBlock, SessionMetadata } from '@ai-systems/shared-types';

export interface UseMessagesResult {
  /**
   * Conversation blocks for the main transcript.
   * Streaming blocks have status === 'pending' with content accumulating.
   */
  blocks: ConversationBlock[];

  /**
   * Set of block IDs that are currently streaming (status === 'pending').
   * Use to show typing indicators, cursors, etc.
   */
  streamingBlockIds: Set<string>;

  /**
   * Whether any block is currently streaming.
   * Convenience for `streamingBlockIds.size > 0`
   */
  isStreaming: boolean;

  /**
   * Session metadata (tokens, cost, model)
   */
  metadata: SessionMetadata;

  /**
   * Error from last message send
   */
  error: Error | null;

  /**
   * Send a message to the agent
   */
  sendMessage: (content: string) => Promise<void>;

  /**
   * Get a specific block by ID
   */
  getBlock: (blockId: string) => ConversationBlock | undefined;

  /**
   * Get all blocks of a specific type
   */
  getBlocksByType: <T extends ConversationBlock['type']>(
    type: T
  ) => Extract<ConversationBlock, { type: T }>[];
}

/**
 * Hook to access and interact with the conversation
 *
 * @param sessionId - Required session ID
 */
export function useMessages(sessionId: string): UseMessagesResult {
  const context = useContext(AgentServiceContext);

  if (!context) {
    throw new Error('useMessages must be used within AgentServiceProvider');
  }

  const { state, dispatch, restClient } = context;
  const [error, setError] = useState<Error | null>(null);

  // Note: Session loading and room join/leave is handled by useAgentSession
  // to ensure proper ordering (session must exist before joining room)

  const session = state.sessions.get(sessionId);

  // Get blocks from conversation state
  const blocks = useMemo(() => {
    if (!session) return [];
    return session.conversationState.blocks;
  }, [session?.conversationState.blocks]);

  // Get IDs of blocks that are currently streaming (status === 'pending')
  const streamingBlockIds = useMemo(() => {
    const ids = new Set<string>();
    for (const block of blocks) {
      if ('status' in block && block.status === 'pending') {
        ids.add(block.id);
      }
    }
    return ids;
  }, [blocks]);

  const metadata = session?.metadata ?? {};
  const isStreaming = streamingBlockIds.size > 0;

  const sendMessage = useCallback(
    async (content: string) => {
      setError(null);

      // Create optimistic block with special prefix ID
      const optimisticId = `optimistic-${Date.now()}`;
      const optimisticBlock: UserMessageBlock = {
        id: optimisticId,
        type: 'user_message',
        content,
        timestamp: new Date().toISOString(),
      };

      // Dispatch optimistic update immediately
      dispatch({
        type: 'OPTIMISTIC_USER_MESSAGE',
        sessionId,
        block: optimisticBlock,
      });

      try {
        await restClient.sendMessage(sessionId, content);
        // Response will come via WebSocket events
      } catch (err) {
        // Remove optimistic message on error
        dispatch({
          type: 'REMOVE_OPTIMISTIC_MESSAGE',
          sessionId,
          optimisticId,
        });

        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      }
    },
    [sessionId, restClient, dispatch]
  );

  const getBlock = useCallback(
    (blockId: string) => {
      return blocks.find((block) => block.id === blockId);
    },
    [blocks]
  );

  const getBlocksByType = useCallback(
    <T extends ConversationBlock['type']>(type: T) => {
      return blocks.filter((block) => block.type === type) as Extract<
        ConversationBlock,
        { type: T }
      >[];
    },
    [blocks]
  );

  return {
    blocks,
    streamingBlockIds,
    isStreaming,
    metadata,
    error,
    sendMessage,
    getBlock,
    getBlocksByType,
  };
}
