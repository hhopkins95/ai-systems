"use client";

import { useState } from "react";
import type { SessionConversationState } from "@ai-systems/shared-types";
import { BlockCard } from "./BlockCard";

interface StateViewerProps {
  state: SessionConversationState;
  stepNumber: number;
}

/**
 * Visual representation of the current conversation state.
 * Shows blocks as cards and subagents as collapsible sections.
 */
export function StateViewer({ state, stepNumber }: StateViewerProps) {
  const [expandedSubagents, setExpandedSubagents] = useState<Set<string>>(
    new Set()
  );
  const [viewMode, setViewMode] = useState<"visual" | "json">("visual");

  const toggleSubagent = (id: string) => {
    setExpandedSubagents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="h-full flex flex-col bg-slate-900 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-slate-700 px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-slate-200">
            State @ Step {stepNumber}
          </h3>
          <span className="text-xs text-slate-500">
            {state.blocks.length} blocks
            {state.subagents.length > 0 && `, ${state.subagents.length} subagents`}
          </span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setViewMode("visual")}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              viewMode === "visual"
                ? "bg-emerald-600 text-white"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            Visual
          </button>
          <button
            onClick={() => setViewMode("json")}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              viewMode === "json"
                ? "bg-emerald-600 text-white"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            JSON
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {viewMode === "json" ? (
          <pre className="text-xs text-emerald-400 font-mono whitespace-pre-wrap break-all">
            {JSON.stringify(state, null, 2)}
          </pre>
        ) : state.blocks.length === 0 ? (
          <div className="text-slate-400 text-center py-8">
            <div className="text-lg mb-2">Empty State</div>
            <div className="text-sm">No blocks yet. Step forward to see state changes.</div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Main conversation blocks */}
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Main Conversation
              </h4>
              <div className="space-y-2">
                {state.blocks.map((block) => (
                  <BlockCard key={block.id} block={block} />
                ))}
              </div>
            </div>

            {/* Subagents */}
            {state.subagents.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Subagents ({state.subagents.length})
                </h4>
                <div className="space-y-2">
                  {state.subagents.map((subagent) => {
                    const isExpanded = expandedSubagents.has(subagent.toolUseId);
                    const statusColor =
                      subagent.status === "completed"
                        ? "bg-emerald-600"
                        : subagent.status === "running"
                        ? "bg-blue-600 animate-pulse"
                        : subagent.status === "error"
                        ? "bg-red-600"
                        : "bg-slate-600";

                    return (
                      <div
                        key={subagent.toolUseId}
                        className="border border-indigo-500/50 rounded-lg bg-indigo-900/20"
                      >
                        <button
                          onClick={() => toggleSubagent(subagent.toolUseId)}
                          className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-white/5 transition-colors"
                        >
                          <span className="text-slate-500 text-xs">
                            {isExpanded ? "▼" : "▶"}
                          </span>
                          <span className="text-sm">🤝</span>
                          <span className="text-indigo-400 text-sm font-medium">
                            {subagent.name || subagent.toolUseId.slice(-8)}
                          </span>
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded ${statusColor} text-white`}
                          >
                            {subagent.status}
                          </span>
                          <span className="ml-auto text-slate-500 text-xs">
                            {subagent.blocks.length} blocks
                          </span>
                        </button>
                        {isExpanded && (
                          <div className="px-3 pb-3 space-y-2">
                            {subagent.blocks.length === 0 ? (
                              <div className="text-slate-500 text-xs text-center py-2">
                                No blocks in subagent conversation
                              </div>
                            ) : (
                              subagent.blocks.map((block) => (
                                <BlockCard key={block.id} block={block} />
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
