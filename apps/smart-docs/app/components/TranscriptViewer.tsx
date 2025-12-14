'use client';

import { useState } from 'react';
import { Prism as SyntaxHighlighterBase } from 'react-syntax-highlighter';
const SyntaxHighlighter = SyntaxHighlighterBase as any;
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type {
  ConversationBlock,
  UserMessageBlock,
  AssistantTextBlock,
  ToolUseBlock,
  ToolResultBlock,
  ThinkingBlock,
  SystemBlock,
  SubagentBlock,
  ErrorBlock,
} from '@/types';

interface TranscriptViewerProps {
  blocks: ConversationBlock[];
  subagents?: { id: string; blocks: ConversationBlock[] }[];
}

export default function TranscriptViewer({ blocks, subagents = [] }: TranscriptViewerProps) {
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set());
  const [expandedSubagents, setExpandedSubagents] = useState<Set<string>>(new Set());

  const toggleTool = (id: string) => {
    const next = new Set(expandedTools);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedTools(next);
  };

  const toggleThinking = (id: string) => {
    const next = new Set(expandedThinking);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedThinking(next);
  };

  const toggleSubagent = (id: string) => {
    const next = new Set(expandedSubagents);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedSubagents(next);
  };

  // Find tool results by tool_use_id
  const toolResults = new Map<string, ToolResultBlock>();
  for (const block of blocks) {
    if (block.type === 'tool_result') {
      toolResults.set(block.toolUseId, block);
    }
  }

  // Find subagent transcripts by id
  const subagentMap = new Map(subagents.map(s => [s.id, s.blocks]));

  const renderBlock = (block: ConversationBlock) => {
    switch (block.type) {
      case 'user_message':
        return <UserMessageRenderer key={block.id} block={block} />;
      case 'assistant_text':
        return <AssistantTextRenderer key={block.id} block={block} />;
      case 'tool_use':
        return (
          <ToolUseRenderer
            key={block.id}
            block={block}
            result={toolResults.get(block.toolUseId)}
            expanded={expandedTools.has(block.id)}
            onToggle={() => toggleTool(block.id)}
          />
        );
      case 'tool_result':
        // Rendered inline with tool_use
        return null;
      case 'thinking':
        return (
          <ThinkingRenderer
            key={block.id}
            block={block}
            expanded={expandedThinking.has(block.id)}
            onToggle={() => toggleThinking(block.id)}
          />
        );
      case 'system':
        return <SystemRenderer key={block.id} block={block} />;
      case 'subagent':
        return (
          <SubagentRenderer
            key={block.id}
            block={block}
            subagentBlocks={subagentMap.get(block.subagentId)}
            expanded={expandedSubagents.has(block.id)}
            onToggle={() => toggleSubagent(block.id)}
          />
        );
      case 'error':
        return <ErrorRenderer key={block.id} block={block} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {blocks.map(renderBlock)}
    </div>
  );
}

// ============================================================================
// Block Renderers
// ============================================================================

function UserMessageRenderer({ block }: { block: UserMessageBlock }) {
  const content = typeof block.content === 'string'
    ? block.content
    : block.content.map(c => c.type === 'text' ? c.text : '[image]').join('');

  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-medium">
        U
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-gray-500 mb-1">User</div>
        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
          <p className="whitespace-pre-wrap text-sm">{content}</p>
        </div>
      </div>
    </div>
  );
}

function AssistantTextRenderer({ block }: { block: AssistantTextBlock }) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white text-sm font-medium">
        C
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-gray-500 mb-1">
          Claude {block.model && <span className="text-gray-400">({block.model})</span>}
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
          <p className="whitespace-pre-wrap text-sm">{block.content}</p>
        </div>
      </div>
    </div>
  );
}

function ToolUseRenderer({
  block,
  result,
  expanded,
  onToggle,
}: {
  block: ToolUseBlock;
  result?: ToolResultBlock;
  expanded: boolean;
  onToggle: () => void;
}) {
  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    running: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    success: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  };

  return (
    <div className="ml-11">
      <button
        onClick={onToggle}
        className="w-full text-left border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="font-mono text-sm font-medium text-orange-600 dark:text-orange-400">
            {block.toolName}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded ${statusColors[block.status]}`}>
            {block.status}
          </span>
          {result?.durationMs && (
            <span className="text-xs text-gray-400">{result.durationMs}ms</span>
          )}
        </div>
        {block.description && (
          <p className="text-xs text-gray-500 mt-1 ml-6">{block.description}</p>
        )}
      </button>

      {expanded && (
        <div className="mt-2 ml-6 space-y-2">
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1">Input</div>
            <SyntaxHighlighter
              language="json"
              style={vscDarkPlus}
              customStyle={{ margin: 0, borderRadius: '0.5rem', fontSize: '12px' }}
            >
              {JSON.stringify(block.input, null, 2)}
            </SyntaxHighlighter>
          </div>

          {result && (
            <div>
              <div className="text-xs font-medium text-gray-500 mb-1">
                Output {result.isError && <span className="text-red-500">(error)</span>}
              </div>
              <div className={`rounded-lg overflow-hidden ${result.isError ? 'border-2 border-red-300 dark:border-red-700' : ''}`}>
                <SyntaxHighlighter
                  language="json"
                  style={vscDarkPlus}
                  customStyle={{ margin: 0, borderRadius: '0.5rem', fontSize: '12px', maxHeight: '300px' }}
                  wrapLongLines
                >
                  {typeof result.output === 'string' ? result.output : JSON.stringify(result.output, null, 2)}
                </SyntaxHighlighter>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ThinkingRenderer({
  block,
  expanded,
  onToggle,
}: {
  block: ThinkingBlock;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="ml-11">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
      >
        <svg
          className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="italic">Thinking...</span>
      </button>

      {expanded && (
        <div className="mt-2 ml-6 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400 italic whitespace-pre-wrap">
            {block.content}
          </p>
        </div>
      )}
    </div>
  );
}

function SystemRenderer({ block }: { block: SystemBlock }) {
  const subtypeIcons: Record<string, string> = {
    session_start: '🚀',
    session_end: '🏁',
    error: '⚠️',
    status: 'ℹ️',
    hook_response: '🪝',
    auth_status: '🔐',
    log: '📝',
  };

  return (
    <div className="flex justify-center">
      <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full">
        {subtypeIcons[block.subtype] || '•'} {block.message}
      </div>
    </div>
  );
}

function SubagentRenderer({
  block,
  subagentBlocks,
  expanded,
  onToggle,
}: {
  block: SubagentBlock;
  subagentBlocks?: ConversationBlock[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    running: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    success: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  };

  return (
    <div className="ml-11">
      <button
        onClick={onToggle}
        className="w-full text-left border-2 border-purple-200 dark:border-purple-800 rounded-lg p-3 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-4 h-4 text-purple-500 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="font-medium text-purple-600 dark:text-purple-400">
            Subagent: {block.name || block.subagentId}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded ${statusColors[block.status]}`}>
            {block.status}
          </span>
          {block.durationMs && (
            <span className="text-xs text-gray-400">{(block.durationMs / 1000).toFixed(1)}s</span>
          )}
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 ml-6 line-clamp-2">
          {block.input}
        </p>
      </button>

      {expanded && subagentBlocks && (
        <div className="mt-3 ml-4 pl-4 border-l-2 border-purple-300 dark:border-purple-700">
          <TranscriptViewer blocks={subagentBlocks} />
        </div>
      )}

      {expanded && !subagentBlocks && (
        <div className="mt-2 ml-6 text-sm text-gray-500 italic">
          Subagent transcript not available
        </div>
      )}
    </div>
  );
}

function ErrorRenderer({ block }: { block: ErrorBlock }) {
  return (
    <div className="ml-11">
      <div className="border-2 border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="font-medium">Error</span>
          {block.code && (
            <span className="text-xs font-mono bg-red-100 dark:bg-red-900/40 px-2 py-0.5 rounded">
              {block.code}
            </span>
          )}
        </div>
        <p className="text-sm text-red-700 dark:text-red-300 mt-2">{block.message}</p>
      </div>
    </div>
  );
}
