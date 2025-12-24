"use client";

import { useState } from "react";
import type { ConversationBlock } from "@ai-systems/shared-types";

interface BlockCardProps {
  block: ConversationBlock;
  isNew?: boolean;
}

/**
 * Get styling for a block based on its type.
 */
function getBlockStyle(type: string): {
  bgClass: string;
  borderClass: string;
  labelClass: string;
  icon: string;
} {
  switch (type) {
    case "user_message":
      return {
        bgClass: "bg-blue-900/30",
        borderClass: "border-blue-500",
        labelClass: "text-blue-400",
        icon: "👤",
      };
    case "assistant_text":
      return {
        bgClass: "bg-slate-800",
        borderClass: "border-slate-500",
        labelClass: "text-slate-300",
        icon: "🤖",
      };
    case "tool_use":
      return {
        bgClass: "bg-purple-900/30",
        borderClass: "border-purple-500",
        labelClass: "text-purple-400",
        icon: "🔧",
      };
    case "tool_result":
      return {
        bgClass: "bg-emerald-900/30",
        borderClass: "border-emerald-500",
        labelClass: "text-emerald-400",
        icon: "📄",
      };
    case "thinking":
      return {
        bgClass: "bg-amber-900/30",
        borderClass: "border-amber-500",
        labelClass: "text-amber-400",
        icon: "💭",
      };
    case "subagent":
      return {
        bgClass: "bg-indigo-900/30",
        borderClass: "border-indigo-500",
        labelClass: "text-indigo-400",
        icon: "🤝",
      };
    case "error":
      return {
        bgClass: "bg-red-900/30",
        borderClass: "border-red-500",
        labelClass: "text-red-400",
        icon: "❌",
      };
    case "skill_load":
      return {
        bgClass: "bg-cyan-900/30",
        borderClass: "border-cyan-500",
        labelClass: "text-cyan-400",
        icon: "📚",
      };
    default:
      return {
        bgClass: "bg-slate-800",
        borderClass: "border-slate-600",
        labelClass: "text-slate-400",
        icon: "📦",
      };
  }
}

/**
 * Get status badge styling.
 */
function getStatusStyle(status: string | undefined): string {
  switch (status) {
    case "complete":
    case "success":
      return "bg-emerald-600 text-white";
    case "pending":
      return "bg-amber-600 text-white";
    case "running":
      return "bg-blue-600 text-white animate-pulse";
    case "error":
      return "bg-red-600 text-white";
    default:
      return "bg-slate-600 text-white";
  }
}

/**
 * Truncate content for preview.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

/**
 * Get content preview for a block.
 */
function getContentPreview(block: ConversationBlock): string {
  switch (block.type) {
    case "user_message":
    case "assistant_text":
    case "thinking":
      return typeof block.content === "string"
        ? truncate(block.content, 200)
        : JSON.stringify(block.content).slice(0, 200);
    case "tool_use":
      return block.toolName || "unknown tool";
    case "tool_result":
      if (block.isError) return "Error";
      if (typeof block.output === "string") return truncate(block.output, 100);
      return "Result";
    case "subagent":
      return block.name || block.subagentId || "subagent";
    case "error":
      return block.message || "Unknown error";
    case "skill_load":
      return block.skillName || "skill";
    default:
      return "";
  }
}

/**
 * Compact card for displaying a conversation block in the state viewer.
 */
export function BlockCard({ block, isNew }: BlockCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const style = getBlockStyle(block.type);
  const statusStyle = getStatusStyle(block.status);
  const preview = getContentPreview(block);

  return (
    <div
      className={`rounded-lg border-l-4 ${style.borderClass} ${style.bgClass} ${
        isNew ? "ring-2 ring-emerald-500 ring-opacity-50" : ""
      }`}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-white/5 transition-colors rounded-t-lg"
      >
        <span className="text-sm">{style.icon}</span>
        <span className={`text-xs font-semibold uppercase ${style.labelClass}`}>
          {block.type.replace("_", " ")}
        </span>
        {block.status && (
          <span className={`text-xs px-1.5 py-0.5 rounded ${statusStyle}`}>
            {block.status}
          </span>
        )}
        <span className="ml-auto text-slate-500 text-xs font-mono truncate max-w-[100px]">
          {block.id.slice(-8)}
        </span>
        <span className="text-slate-500 text-xs">
          {isExpanded ? "▼" : "▶"}
        </span>
      </button>

      {/* Preview or expanded content */}
      {isExpanded ? (
        <div className="px-3 pb-3">
          <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-all bg-slate-900 rounded p-2 max-h-48 overflow-y-auto">
            {JSON.stringify(block, null, 2)}
          </pre>
        </div>
      ) : preview ? (
        <div className="px-3 pb-2">
          <p className="text-xs text-slate-400 line-clamp-2">{preview}</p>
        </div>
      ) : null}
    </div>
  );
}
