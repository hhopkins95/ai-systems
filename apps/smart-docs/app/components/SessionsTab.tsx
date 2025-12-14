'use client';

import { useState, useEffect } from 'react';
import type { SessionMetadata, ParsedTranscript } from '@/types';
import TranscriptViewer from './TranscriptViewer';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function SessionsTab() {
  const [sessions, setSessions] = useState<SessionMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<ParsedTranscript | null>(null);
  const [loadingTranscript, setLoadingTranscript] = useState(false);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/sessions');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch sessions');
      }

      setSessions(data.sessions);
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch sessions');
    } finally {
      setLoading(false);
    }
  };

  const loadTranscript = async (sessionId: string) => {
    if (selectedSession === sessionId) return;

    try {
      setLoadingTranscript(true);
      setSelectedSession(sessionId);
      setTranscript(null);

      const response = await fetch(`/api/sessions/${sessionId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load transcript');
      }

      setTranscript(data);
    } catch (err) {
      console.error('Failed to load transcript:', err);
      setError(err instanceof Error ? err.message : 'Failed to load transcript');
    } finally {
      setLoadingTranscript(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-500">Loading sessions...</div>
      </div>
    );
  }

  if (error && sessions.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 mb-2">Error: {error}</div>
          <button
            onClick={fetchSessions}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-gray-500">
          <p className="text-lg mb-2">No sessions found</p>
          <p className="text-sm">Start a Claude Code session in this project to see it here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* Session List - Left Panel */}
      <div className="w-80 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
        <div className="p-4">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
            {sessions.length} Session{sessions.length !== 1 ? 's' : ''}
          </h3>
          <div className="space-y-2">
            {sessions.map((session) => (
              <button
                key={session.sessionId}
                onClick={() => loadTranscript(session.sessionId)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  selectedSession === session.sessionId
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <div className="font-mono text-xs text-gray-600 dark:text-gray-400 truncate">
                  {session.sessionId}
                </div>
                <div className="text-sm text-gray-900 dark:text-gray-100 mt-1">
                  {formatDate(session.modifiedAt)}
                </div>
                <div className="flex gap-3 mt-1 text-xs text-gray-500">
                  <span>{formatBytes(session.sizeBytes)}</span>
                  {session.subagentCount > 0 && (
                    <span className="text-purple-600 dark:text-purple-400">
                      {session.subagentCount} subagent{session.subagentCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Transcript Viewer - Right Panel */}
      <div className="flex-1 overflow-y-auto">
        {!selectedSession && (
          <div className="h-full flex items-center justify-center text-gray-500">
            Select a session to view its transcript
          </div>
        )}

        {selectedSession && loadingTranscript && (
          <div className="h-full flex items-center justify-center text-gray-500">
            Loading transcript...
          </div>
        )}

        {selectedSession && !loadingTranscript && transcript && (
          <div className="p-6">
            <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold">Session Transcript</h2>
              <p className="text-sm text-gray-500 font-mono">{selectedSession}</p>
              {transcript.subagents.length > 0 && (
                <p className="text-sm text-purple-600 dark:text-purple-400 mt-1">
                  {transcript.subagents.length} subagent transcript{transcript.subagents.length !== 1 ? 's' : ''} included
                </p>
              )}
            </div>
            <TranscriptViewer
              blocks={transcript.blocks}
              subagents={transcript.subagents}
            />
          </div>
        )}

        {selectedSession && !loadingTranscript && !transcript && (
          <div className="h-full flex items-center justify-center text-gray-500">
            Failed to load transcript
          </div>
        )}
      </div>
    </div>
  );
}
