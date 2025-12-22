"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { BACKEND_URL } from "@/lib/constants";

interface Fixture {
  name: string;
  size: number;
  type: "json" | "jsonl";
}

interface ConversionResult {
  sessionEvents?: unknown[];
  finalState: {
    blocks: unknown[];
    subagents: unknown[];
  };
  stats: {
    rawEventCount?: number;
    sessionEventCount?: number;
    blockCount: number;
    subagentCount: number;
  };
}

type ConversionMode = "streaming" | "transcript";

/**
 * Converter Debug Page
 *
 * Visualizes the conversion process from raw OpenCode events to SessionEvents and final state.
 * Helps debug issues with the block converter and reducer.
 */
export default function DebugPage() {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [selectedFixture, setSelectedFixture] = useState<string>("");
  const [mode, setMode] = useState<ConversionMode>("streaming");
  const [rawContent, setRawContent] = useState<string>("");
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["stats", "blocks"])
  );

  // Fetch fixtures list on mount
  useEffect(() => {
    async function loadFixtures() {
      try {
        const response = await fetch(`${BACKEND_URL}/debug/fixtures`);
        if (!response.ok) throw new Error("Failed to load fixtures");
        const data = await response.json();
        setFixtures(data.fixtures);
        // Auto-select first jsonl file for streaming mode
        const jsonlFile = data.fixtures.find((f: Fixture) => f.type === "jsonl");
        if (jsonlFile) setSelectedFixture(jsonlFile.name);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    }
    loadFixtures();
  }, []);

  // Load fixture content when selection changes
  const loadFixture = useCallback(async () => {
    if (!selectedFixture) return;

    try {
      const response = await fetch(
        `${BACKEND_URL}/debug/fixtures/${encodeURIComponent(selectedFixture)}`
      );
      if (!response.ok) throw new Error("Failed to load fixture");
      const content = await response.text();
      setRawContent(content);
      setResult(null); // Clear previous result
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, [selectedFixture]);

  useEffect(() => {
    loadFixture();
  }, [loadFixture]);

  // Run conversion
  const runConversion = async () => {
    if (!rawContent) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${BACKEND_URL}/debug/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          content: rawContent,
          mainSessionId: "debug-session",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Conversion failed");
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const renderCollapsibleJson = (
    title: string,
    data: unknown,
    key: string,
    maxHeight = "max-h-96"
  ) => {
    const isExpanded = expandedSections.has(key);
    const jsonString = JSON.stringify(data, null, 2);
    const lineCount = jsonString.split("\n").length;

    return (
      <div key={key} className="border rounded mb-2">
        <button
          onClick={() => toggleSection(key)}
          className="w-full px-3 py-2 text-left bg-gray-50 hover:bg-gray-100 flex items-center justify-between"
        >
          <span className="font-medium text-sm">{title}</span>
          <span className="text-xs text-gray-500">
            {lineCount} lines {isExpanded ? "[-]" : "[+]"}
          </span>
        </button>
        {isExpanded && (
          <pre
            className={`p-3 text-xs overflow-x-auto bg-gray-900 text-green-400 ${maxHeight} overflow-y-auto`}
          >
            {jsonString}
          </pre>
        )}
      </div>
    );
  };

  // Parse raw content for display
  const getRawEvents = (): unknown[] => {
    if (!rawContent) return [];
    try {
      if (selectedFixture.endsWith(".jsonl")) {
        return rawContent
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line));
      }
      return [JSON.parse(rawContent)];
    } catch {
      return [];
    }
  };

  const rawEvents = getRawEvents();

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50">
      {/* Header */}
      <header className="flex-shrink-0 bg-white border-b shadow-sm">
        <div className="max-w-screen-2xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">
                Converter Debug
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Visualize raw events → session events → final state
              </p>
            </div>
            <Link
              href="/"
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      {/* Controls */}
      <div className="flex-shrink-0 bg-white border-b px-6 py-4">
        <div className="max-w-screen-2xl mx-auto flex items-center gap-6">
          {/* Fixture selector */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">
              Fixture:
            </label>
            <select
              value={selectedFixture}
              onChange={(e) => setSelectedFixture(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm bg-white"
            >
              <option value="">Select a fixture...</option>
              {fixtures.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name} ({(f.size / 1024).toFixed(1)} KB)
                </option>
              ))}
            </select>
          </div>

          {/* Mode selector */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">Mode:</label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="mode"
                value="streaming"
                checked={mode === "streaming"}
                onChange={() => setMode("streaming")}
                className="text-blue-500"
              />
              <span className="text-sm">Streaming</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="mode"
                value="transcript"
                checked={mode === "transcript"}
                onChange={() => setMode("transcript")}
                className="text-blue-500"
              />
              <span className="text-sm">Transcript</span>
            </label>
          </div>

          {/* Run button */}
          <button
            onClick={runConversion}
            disabled={!rawContent || isLoading}
            className="px-4 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium"
          >
            {isLoading ? "Converting..." : "Run Conversion"}
          </button>

          {/* Stats summary */}
          {result && (
            <div className="flex items-center gap-4 text-sm text-gray-600 ml-auto">
              {result.stats.rawEventCount !== undefined && (
                <span>
                  <strong>{result.stats.rawEventCount}</strong> raw events
                </span>
              )}
              {result.stats.sessionEventCount !== undefined && (
                <>
                  <span>→</span>
                  <span>
                    <strong>{result.stats.sessionEventCount}</strong> session
                    events
                  </span>
                </>
              )}
              <span>→</span>
              <span>
                <strong>{result.stats.blockCount}</strong> blocks,{" "}
                <strong>{result.stats.subagentCount}</strong> subagents
              </span>
            </div>
          )}
        </div>

        {/* Error display */}
        {error && (
          <div className="max-w-screen-2xl mx-auto mt-3">
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">
              {error}
            </div>
          </div>
        )}
      </div>

      {/* Main content - 3 columns */}
      <main className="flex-1 min-h-0 overflow-hidden">
        <div className="h-full grid grid-cols-3 gap-4 p-4">
          {/* Column 1: Raw Events */}
          <div className="flex flex-col bg-white rounded-lg shadow overflow-hidden">
            <div className="flex-shrink-0 border-b px-4 py-3 bg-gray-50">
              <h2 className="font-semibold text-gray-800">
                Raw Events ({rawEvents.length})
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                OpenCode SDK events from fixture
              </p>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              {rawEvents.length === 0 ? (
                <div className="text-gray-400 text-center py-8">
                  Select a fixture to load events
                </div>
              ) : (
                rawEvents.slice(0, 100).map((event, idx) => (
                  <div key={idx} className="mb-2">
                    {renderCollapsibleJson(
                      `Event ${idx}: ${(event as { type?: string }).type || "unknown"}`,
                      event,
                      `raw-${idx}`,
                      "max-h-48"
                    )}
                  </div>
                ))
              )}
              {rawEvents.length > 100 && (
                <div className="text-center text-gray-500 text-sm py-4">
                  Showing first 100 of {rawEvents.length} events
                </div>
              )}
            </div>
          </div>

          {/* Column 2: Session Events */}
          <div className="flex flex-col bg-white rounded-lg shadow overflow-hidden">
            <div className="flex-shrink-0 border-b px-4 py-3 bg-gray-50">
              <h2 className="font-semibold text-gray-800">
                Session Events ({result?.sessionEvents?.length ?? 0})
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Converted events (streaming mode only)
              </p>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              {!result ? (
                <div className="text-gray-400 text-center py-8">
                  Click "Run Conversion" to see results
                </div>
              ) : mode === "transcript" ? (
                <div className="text-gray-400 text-center py-8">
                  Session events not available in transcript mode
                </div>
              ) : !result.sessionEvents || result.sessionEvents.length === 0 ? (
                <div className="text-gray-400 text-center py-8">
                  No session events generated
                </div>
              ) : (
                result.sessionEvents.slice(0, 200).map((event, idx) => (
                  <div key={idx} className="mb-2">
                    {renderCollapsibleJson(
                      `${idx}: ${(event as { type?: string }).type || "unknown"}`,
                      event,
                      `session-${idx}`,
                      "max-h-48"
                    )}
                  </div>
                ))
              )}
              {result?.sessionEvents && result.sessionEvents.length > 200 && (
                <div className="text-center text-gray-500 text-sm py-4">
                  Showing first 200 of {result.sessionEvents.length} events
                </div>
              )}
            </div>
          </div>

          {/* Column 3: Final State */}
          <div className="flex flex-col bg-white rounded-lg shadow overflow-hidden">
            <div className="flex-shrink-0 border-b px-4 py-3 bg-gray-50">
              <h2 className="font-semibold text-gray-800">Final State</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                SessionConversationState after reduction
              </p>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              {!result ? (
                <div className="text-gray-400 text-center py-8">
                  Click "Run Conversion" to see results
                </div>
              ) : (
                <>
                  {/* Stats */}
                  {renderCollapsibleJson("Stats", result.stats, "stats")}

                  {/* Blocks */}
                  <h3 className="font-medium text-sm text-gray-700 mt-4 mb-2">
                    Blocks ({result.finalState.blocks.length})
                  </h3>
                  {result.finalState.blocks.map((block, idx) => (
                    <div key={idx} className="mb-2">
                      {renderCollapsibleJson(
                        `${idx}: ${(block as { type?: string }).type || "unknown"}`,
                        block,
                        `block-${idx}`,
                        "max-h-48"
                      )}
                    </div>
                  ))}

                  {/* Subagents */}
                  {result.finalState.subagents.length > 0 && (
                    <>
                      <h3 className="font-medium text-sm text-gray-700 mt-4 mb-2">
                        Subagents ({result.finalState.subagents.length})
                      </h3>
                      {result.finalState.subagents.map((subagent, idx) => (
                        <div key={idx} className="mb-2">
                          {renderCollapsibleJson(
                            `Subagent ${idx}: ${(subagent as { toolUseId?: string }).toolUseId || "unknown"}`,
                            subagent,
                            `subagent-${idx}`,
                            "max-h-64"
                          )}
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
