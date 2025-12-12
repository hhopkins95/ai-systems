"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import {
  useAgentSession,
  useSessionList,
  useLogs,
  type SessionLogEntry,
  type LogLevel,
  type SessionRuntimeState,
} from "@hhopkins/agent-client";
import { BACKEND_URL, API_KEY, type SupportedArchitecture } from "@/lib/constants";
import { SessionOptionsPopover } from "./SessionOptionsPopover";

interface ExecutionMonitorProps {
  sessionId: string;
  defaultExpanded?: boolean;
  onDelete?: () => void;
}

// ============================================================================
// Sub-components
// ============================================================================

/** Status badge with appropriate colors */
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    inactive: "bg-gray-100 text-gray-700",
    starting: "bg-yellow-100 text-yellow-700",
    ready: "bg-green-100 text-green-700",
    error: "bg-red-100 text-red-700",
    terminated: "bg-gray-100 text-gray-700",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] ?? colors.inactive}`}
    >
      {status}
    </span>
  );
}

/** Log level badge */
function LogLevelBadge({ level }: { level: LogLevel }) {
  const colors: Record<LogLevel, string> = {
    debug: "bg-gray-200 text-gray-700",
    info: "bg-blue-100 text-blue-700",
    warn: "bg-yellow-100 text-yellow-800",
    error: "bg-red-100 text-red-700",
  };
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase ${colors[level]}`}
    >
      {level}
    </span>
  );
}

/** Relative time display */
function RelativeTime({ timestamp }: { timestamp: number }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  let text: string;
  if (seconds < 60) text = `${seconds}s ago`;
  else if (minutes < 60) text = `${minutes}m ago`;
  else text = `${hours}h ${minutes % 60}m ago`;

  return <span className="text-gray-500 text-xs">{text}</span>;
}

/** Active query timer */
function QueryTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - startedAt);
    }, 100);
    return () => clearInterval(interval);
  }, [startedAt]);

  const seconds = (elapsed / 1000).toFixed(1);
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="animate-pulse w-2 h-2 rounded-full bg-blue-500" />
      <span className="font-mono">{seconds}s</span>
    </div>
  );
}

/** Expandable JSON data viewer */
function DataViewer({ data }: { data: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-[10px] text-blue-600 hover:text-blue-700"
      >
        {expanded ? "Hide data" : "Show data"}
      </button>
      {expanded && (
        <pre className="mt-1 p-2 bg-gray-800 text-green-400 text-[10px] rounded overflow-x-auto max-h-32">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

/** Single log entry row */
function LogEntry({ log }: { log: SessionLogEntry }) {
  const time = new Date(log.timestamp).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="py-1 border-b border-gray-100 last:border-0">
      <div className="flex items-start gap-2">
        <span className="text-gray-400 text-[10px] font-mono flex-shrink-0">
          {time}
        </span>
        <LogLevelBadge level={log.level} />
        <span className="text-xs text-gray-700 flex-1 break-words">
          {log.message}
        </span>
      </div>
      {log.data && Object.keys(log.data).length > 0 && (
        <div className="ml-16">
          <DataViewer data={log.data} />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ExecutionMonitor({
  sessionId,
  defaultExpanded = true,
  onDelete,
}: ExecutionMonitorProps) {
  const { session, updateSessionOptions, terminateExecutionEnvironment, isLoading: isUpdatingOptions } = useAgentSession(sessionId);
  const { sessions, refresh } = useSessionList();
  const { logs, clearLogs } = useLogs(sessionId);

  const runtime = session?.info.runtime;
  const sessionInfo = sessions.find((s) => s.sessionId === sessionId);

  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [activeSection, setActiveSection] = useState<
    "status" | "logs" | "state"
  >("status");
  const [levelFilter, setLevelFilter] = useState<LogLevel[]>([
    "info",
    "warn",
    "error",
  ]);
  const [autoScroll, setAutoScroll] = useState(true);

  // Session header state
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  // Terminate environment state
  const [isTerminating, setIsTerminating] = useState(false);
  const [showTerminateConfirm, setShowTerminateConfirm] = useState(false);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs.length, autoScroll]);

  // Filter logs by selected levels
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => levelFilter.includes(log.level));
  }, [logs, levelFilter]);

  const toggleLevel = (level: LogLevel) => {
    setLevelFilter((prev) =>
      prev.includes(level)
        ? prev.filter((l) => l !== level)
        : [...prev, level]
    );
  };

  const handleCopyId = async () => {
    await navigator.clipboard.writeText(sessionId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = async () => {
    if (!showConfirm) {
      setShowConfirm(true);
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`${BACKEND_URL}/sessions/${sessionId}`, {
        method: "DELETE",
        headers: {
          "x-api-key": API_KEY,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to delete session");
      }

      await refresh();
      onDelete?.();
    } catch (error) {
      console.error("Failed to delete session:", error);
      alert("Failed to delete session. Please try again.");
    } finally {
      setIsDeleting(false);
      setShowConfirm(false);
    }
  };

  const handleCancelDelete = () => {
    setShowConfirm(false);
  };

  const handleTerminate = async () => {
    if (!showTerminateConfirm) {
      setShowTerminateConfirm(true);
      return;
    }

    setIsTerminating(true);
    try {
      await terminateExecutionEnvironment();
    } catch (error) {
      console.error("Failed to terminate environment:", error);
      alert("Failed to terminate environment. Please try again.");
    } finally {
      setIsTerminating(false);
      setShowTerminateConfirm(false);
    }
  };

  const handleCancelTerminate = () => {
    setShowTerminateConfirm(false);
  };

  if (!runtime) {
    return (
      <div className="bg-white rounded-lg shadow p-4">
        <p className="text-gray-500 text-sm">Loading runtime state...</p>
      </div>
    );
  }

  const ee = runtime.executionEnvironment;

  return (
    <div className="bg-white rounded-lg shadow mb-4">
      {/* Header with session info */}
      <div className="px-4 py-3 border-b">
        <div className="flex items-center justify-between flex-wrap gap-2">
          {/* Left side - Session info */}
          <div className="flex items-center gap-4 flex-wrap">
            {/* Session ID */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">ID:</span>
              <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono">
                {sessionId.slice(0, 12)}...
              </code>
              <button
                onClick={handleCopyId}
                className="text-xs text-blue-600 hover:text-blue-700"
                title="Copy full session ID"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>

            {/* Type badge */}
            {sessionInfo && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Type:</span>
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                  {sessionInfo.type}
                </span>
              </div>
            )}

            {/* Session options (model selector) */}
            {sessionInfo && (
              <SessionOptionsPopover
                architecture={sessionInfo.type as SupportedArchitecture}
                currentModel={sessionInfo.sessionOptions?.model}
                onModelChange={async (model) => {
                  await updateSessionOptions({ model });
                  await refresh();
                }}
                isUpdating={isUpdatingOptions}
              />
            )}

            {/* Runtime status */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Status:</span>
              {ee && <StatusBadge status={ee.status} />}
              {ee?.statusMessage && (
                <span className="text-xs text-gray-500 italic">
                  {ee.statusMessage}
                </span>
              )}
            </div>

            {/* Active query indicator */}
            {runtime.activeQuery && (
              <QueryTimer startedAt={runtime.activeQuery.startedAt} />
            )}
          </div>

          {/* Right side - Terminate, Delete and expand/collapse */}
          <div className="flex items-center gap-3">
            {/* Terminate environment button - only show when environment is running */}
            {ee && (ee.status === "ready" || ee.status === "starting") && (
              showTerminateConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-orange-600">Terminate env?</span>
                  <button
                    onClick={handleTerminate}
                    disabled={isTerminating}
                    className="px-2 py-1 text-xs bg-orange-500 text-white rounded hover:bg-orange-600 disabled:bg-gray-300"
                  >
                    {isTerminating ? "..." : "Yes"}
                  </button>
                  <button
                    onClick={handleCancelTerminate}
                    disabled={isTerminating}
                    className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleTerminate}
                  className="px-3 py-1 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200 transition-colors"
                  title="Terminate execution environment (session stays loaded)"
                >
                  Terminate Env
                </button>
              )
            )}

            {/* Delete button */}
            {showConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600">Delete?</span>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-300"
                >
                  {isDeleting ? "..." : "Yes"}
                </button>
                <button
                  onClick={handleCancelDelete}
                  disabled={isDeleting}
                  className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={handleDelete}
                className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                title="Delete session permanently"
              >
                Delete
              </button>
            )}

            {/* Expand/collapse toggle */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
            >
              {isExpanded ? "[-]" : "[+]"}
            </button>
          </div>
        </div>
      </div>

      {isExpanded && (
        <>
          {/* Tab Navigation */}
          <div className="flex border-b">
            {(["status", "logs", "state"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveSection(tab)}
                className={`px-4 py-2 text-sm font-medium capitalize ${
                  activeSection === tab
                    ? "text-blue-600 border-b-2 border-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab}
                {tab === "logs" && (
                  <span className="ml-1 text-xs">({logs.length})</span>
                )}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="p-4">
            {/* Status Section */}
            {activeSection === "status" && (
              <div className="space-y-4">
                {/* Loaded State */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 w-32">
                    Session Loaded:
                  </span>
                  <span
                    className={`text-sm font-medium ${runtime.isLoaded ? "text-green-600" : "text-gray-500"}`}
                  >
                    {runtime.isLoaded ? "Yes" : "No"}
                  </span>
                </div>

                {/* Execution Environment Details */}
                {ee ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600 w-32">
                        EE Status:
                      </span>
                      <StatusBadge status={ee.status} />
                      {ee.statusMessage && (
                        <span className="text-sm text-gray-500 italic">
                          {ee.statusMessage}
                        </span>
                      )}
                    </div>

                    {ee.id && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600 w-32">
                          EE ID:
                        </span>
                        <code className="text-xs bg-gray-100 px-2 py-0.5 rounded font-mono">
                          {ee.id}
                        </code>
                      </div>
                    )}

                    {ee.lastHealthCheck && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600 w-32">
                          Last Health Check:
                        </span>
                        <RelativeTime timestamp={ee.lastHealthCheck} />
                      </div>
                    )}

                    {typeof ee.restartCount === "number" &&
                      ee.restartCount > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-600 w-32">
                            Restart Count:
                          </span>
                          <span className="text-sm font-medium text-orange-600">
                            {ee.restartCount}
                          </span>
                        </div>
                      )}

                    {/* Error Details */}
                    {ee.status === "error" && ee.lastError && (
                      <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
                        <h4 className="text-sm font-medium text-red-800 mb-2">
                          Error Details
                        </h4>
                        <p className="text-sm text-red-700">
                          {ee.lastError.message}
                        </p>
                        {ee.lastError.code && (
                          <p className="text-xs text-red-600 mt-1">
                            Code: {ee.lastError.code}
                          </p>
                        )}
                        <p className="text-xs text-red-500 mt-1">
                          {new Date(ee.lastError.timestamp).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-sm text-gray-500 italic">
                    No execution environment configured
                  </div>
                )}

                {/* Active Query */}
                {runtime.activeQuery && (
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-blue-800">
                        Active Query
                      </span>
                      <QueryTimer startedAt={runtime.activeQuery.startedAt} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Logs Section */}
            {activeSection === "logs" && (
              <div className="space-y-3">
                {/* Controls */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Filter:</span>
                    {(["debug", "info", "warn", "error"] as LogLevel[]).map(
                      (level) => (
                        <label
                          key={level}
                          className="flex items-center gap-1 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={levelFilter.includes(level)}
                            onChange={() => toggleLevel(level)}
                            className="w-3 h-3"
                          />
                          <LogLevelBadge level={level} />
                        </label>
                      )
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoScroll}
                        onChange={(e) => setAutoScroll(e.target.checked)}
                        className="w-3 h-3"
                      />
                      Auto-scroll
                    </label>
                    <button
                      onClick={clearLogs}
                      className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {/* Log List */}
                <div className="max-h-64 overflow-y-auto border rounded">
                  {filteredLogs.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 text-sm">
                      {logs.length === 0
                        ? "No logs yet"
                        : "No logs match filter"}
                    </div>
                  ) : (
                    <div className="p-2">
                      {filteredLogs.map((log) => (
                        <LogEntry key={log.id} log={log} />
                      ))}
                      <div ref={logsEndRef} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* State Tree Section */}
            {activeSection === "state" && (
              <div>
                <p className="text-xs text-gray-500 mb-2">
                  Real-time SessionRuntimeState object
                </p>
                <pre className="p-3 bg-gray-900 text-green-400 text-xs rounded overflow-auto max-h-80 font-mono">
                  {JSON.stringify(runtime, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
