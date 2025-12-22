"use client";

import { useState } from "react";
import type { AnySessionEvent } from "@ai-systems/shared-types";

interface EventDetailPanelProps {
  rawEvent: unknown | null;
  sessionEvents: AnySessionEvent[];
  stepNumber: number;
}

/**
 * Get a badge color for session event type.
 */
function getSessionEventColor(type: string): string {
  if (type.startsWith("block:")) return "bg-blue-600";
  if (type.startsWith("file:")) return "bg-emerald-600";
  if (type.startsWith("subagent:")) return "bg-purple-600";
  if (type.startsWith("session:")) return "bg-amber-600";
  if (type.startsWith("metadata:")) return "bg-slate-600";
  if (type === "log") return "bg-slate-500";
  if (type === "error") return "bg-red-600";
  return "bg-slate-600";
}

/**
 * Panel showing the raw event and converted session events for the current step.
 */
export function EventDetailPanel({
  rawEvent,
  sessionEvents,
  stepNumber,
}: EventDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<"raw" | "converted">("raw");
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());

  const toggleEventExpanded = (index: number) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  if (stepNumber === 0 || !rawEvent) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400 bg-slate-900 rounded-lg">
        <div className="text-center">
          <div className="text-lg mb-2">Step 0: Initial State</div>
          <div className="text-sm">
            No events processed yet. Step forward to see event details.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-900 rounded-lg overflow-hidden">
      {/* Tabs */}
      <div className="flex-shrink-0 border-b border-slate-700 flex">
        <button
          onClick={() => setActiveTab("raw")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "raw"
              ? "bg-slate-800 text-white border-b-2 border-emerald-500"
              : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          Raw Event
        </button>
        <button
          onClick={() => setActiveTab("converted")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "converted"
              ? "bg-slate-800 text-white border-b-2 border-emerald-500"
              : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          Session Events ({sessionEvents.length})
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {activeTab === "raw" ? (
          <pre className="text-xs text-emerald-400 font-mono whitespace-pre-wrap break-all">
            {JSON.stringify(rawEvent, null, 2)}
          </pre>
        ) : sessionEvents.length === 0 ? (
          <div className="text-slate-400 text-center py-8">
            No session events generated for this raw event
          </div>
        ) : (
          <div className="space-y-2">
            {sessionEvents.map((event, idx) => {
              const isExpanded = expandedEvents.has(idx);
              const colorClass = getSessionEventColor(event.type);

              return (
                <div key={idx} className="border border-slate-700 rounded">
                  <button
                    onClick={() => toggleEventExpanded(idx)}
                    className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-slate-800 transition-colors"
                  >
                    <span className="text-slate-500 text-xs">
                      {isExpanded ? "▼" : "▶"}
                    </span>
                    <span
                      className={`${colorClass} text-white text-xs px-2 py-0.5 rounded font-medium`}
                    >
                      {event.type}
                    </span>
                    {event.context?.conversationId && (
                      <span className="text-slate-500 text-xs">
                        → {event.context.conversationId}
                      </span>
                    )}
                  </button>
                  {isExpanded && (
                    <div className="px-3 pb-3">
                      <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-all bg-slate-800 rounded p-2">
                        {JSON.stringify(event, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
