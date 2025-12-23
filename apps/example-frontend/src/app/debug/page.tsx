"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { BACKEND_URL } from "@/lib/constants";
import { useEventStepper, type ConverterType } from "./hooks/useEventStepper";
import { TimelineControls } from "./components/TimelineControls";
import { EventTimeline } from "./components/EventTimeline";
import { EventDetailPanel } from "./components/EventDetailPanel";
import { StateViewer } from "./components/StateViewer";

interface Fixture {
  name: string;
  size: number;
  fileType: "json" | "jsonl";
  converter: ConverterType;
}

/**
 * Converter Debug Page
 *
 * Step through raw events one at a time and watch the state build incrementally.
 * Supports both OpenCode and Claude SDK converters.
 */
export default function DebugPage() {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [selectedConverter, setSelectedConverter] =
    useState<ConverterType>("opencode");
  const [selectedFixture, setSelectedFixture] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stepper = useEventStepper();

  // Filter fixtures by selected converter
  const filteredFixtures = fixtures.filter(
    (f) => f.converter === selectedConverter
  );

  // Fetch fixtures list on mount
  useEffect(() => {
    async function loadFixtures() {
      try {
        const response = await fetch(`${BACKEND_URL}/debug/fixtures`);
        if (!response.ok) throw new Error("Failed to load fixtures");
        const data = await response.json();
        setFixtures(data.fixtures);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    }
    loadFixtures();
  }, []);

  // Auto-select first fixture when converter changes
  useEffect(() => {
    const firstFixture = filteredFixtures.find(
      (f) => f.fileType === "jsonl"
    );
    if (firstFixture) {
      setSelectedFixture(firstFixture.name);
    } else if (filteredFixtures.length > 0) {
      setSelectedFixture(filteredFixtures[0].name);
    } else {
      setSelectedFixture("");
    }
  }, [selectedConverter, fixtures]);

  // Load and convert fixture
  const loadFixture = useCallback(async () => {
    if (!selectedFixture) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch raw content
      const contentResponse = await fetch(
        `${BACKEND_URL}/debug/fixtures/${selectedConverter}/${encodeURIComponent(
          selectedFixture
        )}`
      );
      if (!contentResponse.ok) throw new Error("Failed to load fixture content");
      const content = await contentResponse.text();

      // Run conversion
      const convertResponse = await fetch(`${BACKEND_URL}/debug/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "streaming",
          content,
          converter: selectedConverter,
          filename: selectedFixture,
        }),
      });

      if (!convertResponse.ok) {
        const errorData = await convertResponse.json();
        throw new Error(errorData.error || "Conversion failed");
      }

      const data = await convertResponse.json();
      stepper.loadData({
        rawEvents: data.rawEvents,
        sessionEventsByStep: data.sessionEventsByStep,
        finalState: data.finalState,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, [selectedFixture, selectedConverter, stepper]);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="flex-shrink-0 bg-slate-900 border-b border-slate-800">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-white">Converter Debug</h1>
              <p className="text-sm text-slate-400 mt-0.5">
                Step through events and watch state build incrementally
              </p>
            </div>
            <Link
              href="/"
              className="px-4 py-2 bg-slate-800 text-slate-300 rounded hover:bg-slate-700 transition-colors"
            >
              ← Dashboard
            </Link>
          </div>
        </div>
      </header>

      {/* Controls */}
      <div className="flex-shrink-0 bg-slate-900 border-b border-slate-800 px-6 py-3">
        <div className="flex items-center gap-6">
          {/* Converter toggle */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">Converter:</span>
            <div className="flex gap-1">
              <button
                onClick={() => setSelectedConverter("opencode")}
                className={`px-3 py-1.5 text-sm rounded transition-colors ${
                  selectedConverter === "opencode"
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                OpenCode
              </button>
              <button
                onClick={() => setSelectedConverter("claude-sdk")}
                className={`px-3 py-1.5 text-sm rounded transition-colors ${
                  selectedConverter === "claude-sdk"
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                Claude SDK
              </button>
            </div>
          </div>

          {/* Fixture selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">Fixture:</span>
            <select
              value={selectedFixture}
              onChange={(e) => setSelectedFixture(e.target.value)}
              className="bg-slate-800 text-white border border-slate-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Select a fixture...</option>
              {filteredFixtures.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name} ({(f.size / 1024).toFixed(1)} KB)
                </option>
              ))}
            </select>
          </div>

          {/* Load button */}
          <button
            onClick={loadFixture}
            disabled={!selectedFixture || isLoading}
            className="px-4 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-sm font-medium transition-colors"
          >
            {isLoading ? "Loading..." : "Load & Convert"}
          </button>

          {/* Stats */}
          {stepper.isLoaded && (
            <div className="ml-auto flex items-center gap-4 text-sm text-slate-400">
              <span>
                <strong className="text-white">
                  {stepper.state.rawEvents.length}
                </strong>{" "}
                raw events
              </span>
              <span>→</span>
              <span>
                <strong className="text-white">
                  {stepper.state.sessionEventsByStep.flat().length}
                </strong>{" "}
                session events
              </span>
              <span>→</span>
              <span>
                <strong className="text-white">
                  {stepper.currentState.blocks.length}
                </strong>{" "}
                blocks
              </span>
            </div>
          )}
        </div>

        {/* Error display */}
        {error && (
          <div className="mt-3 bg-red-900/50 border border-red-700 text-red-300 px-4 py-2 rounded text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Timeline Controls */}
      {stepper.isLoaded && (
        <div className="flex-shrink-0 px-6 py-3 bg-slate-900/50">
          <TimelineControls
            currentStep={stepper.state.currentStep}
            totalSteps={stepper.state.totalSteps}
            isPlaying={stepper.state.isPlaying}
            playbackSpeed={stepper.state.playbackSpeed}
            onStepForward={stepper.stepForward}
            onStepBackward={stepper.stepBackward}
            onJumpToStart={stepper.jumpToStart}
            onJumpToEnd={stepper.jumpToEnd}
            onJumpToStep={stepper.jumpToStep}
            onTogglePlay={stepper.togglePlay}
            onSetSpeed={stepper.setSpeed}
          />
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 min-h-0 overflow-hidden">
        {!stepper.isLoaded ? (
          <div className="h-full flex items-center justify-center text-slate-400">
            <div className="text-center">
              <div className="text-lg mb-2">No data loaded</div>
              <div className="text-sm">
                Select a fixture and click "Load & Convert" to begin
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full grid grid-rows-[1fr_250px] gap-3 p-4">
            {/* Top row: Event Timeline + State Viewer */}
            <div className="grid grid-cols-[300px_1fr] gap-3 min-h-0">
              {/* Event Timeline */}
              <div className="bg-slate-900 rounded-lg overflow-hidden flex flex-col">
                <div className="flex-shrink-0 px-3 py-2 border-b border-slate-700">
                  <h3 className="text-sm font-semibold text-slate-200">
                    Events ({stepper.state.rawEvents.length})
                  </h3>
                </div>
                <div className="flex-1 min-h-0">
                  <EventTimeline
                    rawEvents={stepper.state.rawEvents}
                    sessionEventsByStep={stepper.state.sessionEventsByStep}
                    currentStep={stepper.state.currentStep}
                    onSelectStep={stepper.jumpToStep}
                  />
                </div>
              </div>

              {/* State Viewer */}
              <StateViewer
                state={stepper.currentState}
                stepNumber={stepper.state.currentStep}
              />
            </div>

            {/* Bottom row: Event Detail Panel */}
            <EventDetailPanel
              rawEvent={stepper.currentRawEvent}
              sessionEvents={stepper.currentSessionEvents}
              stepNumber={stepper.state.currentStep}
            />
          </div>
        )}
      </main>
    </div>
  );
}
