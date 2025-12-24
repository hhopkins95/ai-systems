"use client";

import { useEffect, useRef } from "react";
import type { AnySessionEvent } from "@ai-systems/shared-types";

interface EventTimelineProps {
  rawEvents: unknown[];
  sessionEventsByStep: AnySessionEvent[][];
  currentStep: number;
  onSelectStep: (step: number) => void;
}

/**
 * Get a display label for a raw event based on its type.
 */
function getEventLabel(event: unknown): { type: string; detail: string } {
  if (!event || typeof event !== "object") {
    return { type: "unknown", detail: "" };
  }

  const e = event as Record<string, unknown>;

  // OpenCode events have a top-level "type" field
  if (typeof e.type === "string") {
    const type = e.type;

    // Extract additional details based on type
    if (type === "message.part.updated" && e.properties) {
      const props = e.properties as Record<string, unknown>;
      const part = props.part as Record<string, unknown> | undefined;
      if (part?.type) {
        return { type, detail: String(part.type) };
      }
    }

    if (type === "message.updated") {
      return { type, detail: "" };
    }

    return { type, detail: "" };
  }

  // Claude SDK messages have a "role" field
  if (typeof e.role === "string") {
    const role = e.role;
    if (e.content && Array.isArray(e.content) && e.content.length > 0) {
      const firstContent = e.content[0] as Record<string, unknown>;
      if (firstContent?.type) {
        return { type: role, detail: String(firstContent.type) };
      }
    }
    return { type: role, detail: "" };
  }

  return { type: "unknown", detail: "" };
}

/**
 * Get color class for event type.
 */
function getEventColor(type: string): string {
  // OpenCode event types
  if (type.startsWith("message.part")) return "bg-blue-500";
  if (type.startsWith("message.")) return "bg-indigo-500";
  if (type.startsWith("session.")) return "bg-amber-500";
  if (type.startsWith("file.")) return "bg-emerald-500";

  // Claude SDK message roles
  if (type === "user") return "bg-blue-500";
  if (type === "assistant") return "bg-slate-500";
  if (type === "tool_result") return "bg-purple-500";
  if (type === "system") return "bg-amber-500";

  return "bg-slate-600";
}

/**
 * Scrollable list of all raw events with current step highlighted.
 */
export function EventTimeline({
  rawEvents,
  sessionEventsByStep,
  currentStep,
  onSelectStep,
}: EventTimelineProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Auto-scroll to keep current event visible
  useEffect(() => {
    if (currentStep > 0 && itemRefs.current[currentStep - 1]) {
      itemRefs.current[currentStep - 1]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [currentStep]);

  if (rawEvents.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400">
        No events loaded
      </div>
    );
  }

  return (
    <div ref={listRef} className="h-full overflow-y-auto">
      {/* Step 0 indicator */}
      <button
        onClick={() => onSelectStep(0)}
        className={`w-full px-3 py-2 text-left border-b border-slate-700 transition-colors ${
          currentStep === 0
            ? "bg-emerald-900/50 border-l-4 border-l-emerald-500"
            : "hover:bg-slate-800"
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="text-slate-500 text-xs font-mono w-8">0</span>
          <span className="text-slate-400 text-sm italic">Initial state</span>
        </div>
      </button>

      {/* Event list */}
      {rawEvents.map((event, idx) => {
        const stepNumber = idx + 1;
        const isSelected = currentStep === stepNumber;
        const { type, detail } = getEventLabel(event);
        const sessionEventsCount = sessionEventsByStep[idx]?.length || 0;
        const colorClass = getEventColor(type);

        return (
          <button
            key={idx}
            ref={(el) => {
              itemRefs.current[idx] = el;
            }}
            onClick={() => onSelectStep(stepNumber)}
            className={`w-full px-3 py-2 text-left border-b border-slate-700 transition-colors ${
              isSelected
                ? "bg-emerald-900/50 border-l-4 border-l-emerald-500"
                : "hover:bg-slate-800 border-l-4 border-l-transparent"
            }`}
          >
            <div className="flex items-center gap-2">
              {/* Step number */}
              <span className="text-slate-500 text-xs font-mono w-8">
                {stepNumber}
              </span>

              {/* Event type badge */}
              <span
                className={`${colorClass} text-white text-xs px-1.5 py-0.5 rounded font-medium truncate max-w-[140px]`}
              >
                {type}
              </span>

              {/* Detail */}
              {detail && (
                <span className="text-slate-400 text-xs truncate">{detail}</span>
              )}

              {/* Session events count */}
              {sessionEventsCount > 0 && (
                <span className="ml-auto text-xs text-slate-500 bg-slate-700 px-1.5 py-0.5 rounded">
                  {sessionEventsCount} evt{sessionEventsCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
