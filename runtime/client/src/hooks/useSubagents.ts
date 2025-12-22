/**
 * useSubagents Hook
 *
 * Access subagent conversations for Claude SDK sessions.
 * Provides real-time updates when subagents are discovered or completed.
 *
 * Blocks with status === 'pending' are currently streaming.
 * Content accumulates directly in block.content via the shared reducer.
 */

import { useContext, useCallback, useMemo } from 'react';
import { AgentServiceContext } from '../context/AgentServiceContext';
import type { ConversationBlock } from '@ai-systems/shared-types';

export interface SubagentInfo {
  /** Tool use ID (primary key during streaming) */
  id: string;
  /** Agent ID (available after completion) */
  agentId?: string;
  /** Conversation blocks within this subagent */
  blocks: ConversationBlock[];
  /** Current status */
  status: 'pending' | 'running' | 'success' | 'error';
  /** Set of block IDs currently streaming (status === 'pending') */
  streamingBlockIds: Set<string>;
  /** The prompt/task given to this subagent */
  prompt?: string;
  /** Final output from the subagent */
  output?: string;
  /** Execution duration in milliseconds */
  durationMs?: number;
}

export interface UseSubagentsResult {
  /**
   * Array of all subagents for this session.
   * Blocks with status === 'pending' are streaming.
   */
  subagents: SubagentInfo[];

  /**
   * Number of subagents
   */
  count: number;

  /**
   * Whether any subagent is currently running
   */
  hasRunningSubagents: boolean;

  /**
   * Get a specific subagent by ID (toolUseId or agentId)
   */
  getSubagent: (subagentId: string) => SubagentInfo | undefined;

  /**
   * Get blocks for a specific subagent
   */
  getSubagentBlocks: (subagentId: string) => ConversationBlock[];

  /**
   * Get subagents by status
   */
  getSubagentsByStatus: (
    status: 'pending' | 'running' | 'success' | 'error'
  ) => SubagentInfo[];
}

/**
 * Hook to access subagent conversations for a session
 *
 * Note: Subagents are only available for Claude SDK sessions.
 * Gemini CLI sessions will always return empty arrays.
 *
 * @param sessionId - Required session ID
 */
export function useSubagents(sessionId: string): UseSubagentsResult {
  const context = useContext(AgentServiceContext);

  if (!context) {
    throw new Error('useSubagents must be used within AgentServiceProvider');
  }

  const { state } = context;
  const session = state.sessions.get(sessionId);

  // Map subagents from conversation state to SubagentInfo
  const subagents = useMemo((): SubagentInfo[] => {
    if (!session) return [];

    return session.conversationState.subagents.map((subagent): SubagentInfo => {
      // Find streaming blocks (status === 'pending')
      const streamingBlockIds = new Set<string>();
      for (const block of subagent.blocks) {
        if ('status' in block && block.status === 'pending') {
          streamingBlockIds.add(block.id);
        }
      }

      return {
        id: subagent.toolUseId,
        agentId: subagent.agentId,
        blocks: subagent.blocks,
        status: subagent.status,
        streamingBlockIds,
        prompt: subagent.prompt,
        output: subagent.output,
        durationMs: subagent.durationMs,
      };
    });
  }, [session?.conversationState.subagents]);

  const count = subagents.length;

  const hasRunningSubagents = useMemo(() => {
    return subagents.some((sub) => sub.status === 'pending' || sub.status === 'running');
  }, [subagents]);

  const getSubagent = useCallback(
    (subagentId: string) => {
      // Check both toolUseId (id) and agentId
      return subagents.find((sub) => sub.id === subagentId || sub.agentId === subagentId);
    },
    [subagents]
  );

  const getSubagentBlocks = useCallback(
    (subagentId: string) => {
      return getSubagent(subagentId)?.blocks ?? [];
    },
    [getSubagent]
  );

  const getSubagentsByStatus = useCallback(
    (status: 'pending' | 'running' | 'success' | 'error') => {
      return subagents.filter((sub) => sub.status === status);
    },
    [subagents]
  );

  return {
    subagents,
    count,
    hasRunningSubagents,
    getSubagent,
    getSubagentBlocks,
    getSubagentsByStatus,
  };
}
