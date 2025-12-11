/**
 * useLogs Hook
 *
 * Access session logs for a specific session.
 * Provides filtered log access and clear functionality.
 */

import { useContext, useCallback, useMemo } from 'react';
import { AgentServiceContext } from '../context/AgentServiceContext';
import type { SessionLogEntry, LogLevel } from '../context/reducer';

export type { LogLevel };

export interface UseLogsResult {
  /**
   * All logs for the session (oldest first)
   */
  logs: SessionLogEntry[];

  /**
   * Clear all logs for this session
   */
  clearLogs: () => void;

  /**
   * Get logs filtered by level(s)
   */
  getFilteredLogs: (levels: LogLevel[]) => SessionLogEntry[];
}

/**
 * Hook to access session logs
 *
 * @example
 * ```tsx
 * function LogPanel({ sessionId }: { sessionId: string }) {
 *   const { logs, clearLogs, getFilteredLogs } = useLogs(sessionId);
 *
 *   // Show only warnings and errors
 *   const importantLogs = getFilteredLogs(['warn', 'error']);
 *
 *   return (
 *     <div>
 *       <button onClick={clearLogs}>Clear</button>
 *       {importantLogs.map(log => (
 *         <div key={log.id}>
 *           [{log.level}] {log.message}
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 *
 * @param sessionId - Session ID to get logs for
 */
export function useLogs(sessionId: string): UseLogsResult {
  const context = useContext(AgentServiceContext);

  if (!context) {
    throw new Error('useLogs must be used within AgentServiceProvider');
  }

  const { state, dispatch } = context;

  const session = state.sessions.get(sessionId);
  const logs = session?.logs ?? [];

  const clearLogs = useCallback(() => {
    dispatch({ type: 'SESSION_LOGS_CLEARED', sessionId });
  }, [dispatch, sessionId]);

  const getFilteredLogs = useCallback(
    (levels: LogLevel[]) => {
      if (levels.length === 0) return logs;
      return logs.filter((log) => levels.includes(log.level));
    },
    [logs]
  );

  return useMemo(
    () => ({
      logs,
      clearLogs,
      getFilteredLogs,
    }),
    [logs, clearLogs, getFilteredLogs]
  );
}
