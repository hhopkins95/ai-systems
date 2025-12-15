'use client';

import { useState, useEffect } from 'react';
import ReactMarkdownBase from 'react-markdown';
// Cast to any to avoid React 19 JSX type incompatibility
const ReactMarkdown = ReactMarkdownBase as any;
import { Prism as SyntaxHighlighterBase } from 'react-syntax-highlighter';
// Cast to any to avoid React 19 JSX type incompatibility
const SyntaxHighlighter = SyntaxHighlighterBase as any;
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import type { RuleWithSource } from '@/types';
import Mermaid from './Mermaid';
import { io } from 'socket.io-client';

export default function ContextTab() {
  const [rules, setRules] = useState<RuleWithSource[]>([]);
  const [selectedRule, setSelectedRule] = useState<RuleWithSource | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRules();

    // Set up socket for real-time updates
    const socket = io();
    socket.on('file-change', (event: any) => {
      if (event.area === 'claude' && (event.path.includes('CLAUDE.md') || event.path.includes('/rules/'))) {
        fetchRules();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const fetchRules = async () => {
    try {
      const response = await fetch('/api/claude/context');
      const data = await response.json();
      setRules(data);
    } catch (error) {
      console.error('Failed to fetch rules:', error);
    } finally {
      setLoading(false);
    }
  };

  const getScopeBadgeStyle = (scope?: 'global' | 'project' | 'plugin') => {
    const styles: Record<string, string> = {
      global: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      project: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      plugin: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    };
    return scope ? styles[scope] : styles.project;
  };

  const renderRuleItem = (rule: RuleWithSource) => {
    const ruleName = rule.metadata.isMain ? 'CLAUDE.md' : `${rule.name}.md`;
    const sourceType = rule.source?.type;
    return (
      <div
        key={rule.source?.path || rule.name}
        className={`cursor-pointer px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2 ${
          selectedRule?.name === rule.name && selectedRule?.source?.type === sourceType ? 'bg-blue-100 dark:bg-blue-900' : ''
        }`}
        onClick={() => setSelectedRule(rule)}
      >
        <span>📋 {ruleName}</span>
        {sourceType && (
          <span className={`text-xs px-2 py-0.5 rounded ${getScopeBadgeStyle(sourceType)}`}>
            {sourceType}
          </span>
        )}
      </div>
    );
  };

  if (loading) {
    return <div className="p-4">Loading...</div>;
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-80 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
        <div className="p-4">
          <h3 className="font-bold mb-2">Rules</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Project context and instructions for Claude
          </p>
          {rules.length > 0 ? (
            rules.map(rule => renderRuleItem(rule))
          ) : (
            <div className="text-gray-500 text-sm">
              No rules found.
              <div className="mt-2 text-xs">
                <p>Create rule files at:</p>
                <ul className="list-disc ml-4 mt-1">
                  <li>~/.claude/CLAUDE.md (global)</li>
                  <li>~/.claude/rules/*.md (global rules)</li>
                  <li>./CLAUDE.md (project root)</li>
                  <li>./.claude/rules/*.md (project rules)</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {selectedRule ? (
          <div className="prose dark:prose-invert max-w-none">
            {/* File info header */}
            <div className="mb-6 p-4 bg-gray-100 dark:bg-gray-800 rounded">
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-xl font-bold mt-0 mb-0">
                  {selectedRule.metadata.isMain ? 'CLAUDE.md' : `${selectedRule.name}.md`}
                </h2>
                {selectedRule.source?.type && (
                  <span className={`text-xs px-2 py-1 rounded ${getScopeBadgeStyle(selectedRule.source.type)}`}>
                    {selectedRule.source.type}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-0">
                📂 {selectedRule.source?.path || selectedRule.name}
              </p>
            </div>

            {/* Metadata display */}
            {selectedRule.metadata && Object.keys(selectedRule.metadata).filter(k => k !== 'isMain').length > 0 && (
              <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-950 rounded">
                <h3 className="text-sm font-bold text-blue-900 dark:text-blue-100 mt-0 mb-2">
                  Metadata
                </h3>
                {selectedRule.metadata.paths && (
                  <div className="mb-2">
                    <span className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                      Paths:
                    </span>{' '}
                    <span className="text-sm text-blue-700 dark:text-blue-300">
                      {selectedRule.metadata.paths}
                    </span>
                  </div>
                )}
                {Object.entries(selectedRule.metadata).map(([key, value]) => {
                  if (key !== 'paths' && key !== 'isMain') {
                    return (
                      <div key={key} className="mb-2">
                        <span className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                          {key}:
                        </span>{' '}
                        <span className="text-sm text-blue-700 dark:text-blue-300">
                          {JSON.stringify(value)}
                        </span>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            )}

            {/* Markdown content */}
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ node, inline, className, children, ...props }: any) {
                  const match = /language-(\w+)/.exec(className || '');
                  const code = String(children).replace(/\n$/, '');

                  if (!inline && match?.[1] === 'mermaid') {
                    return <Mermaid chart={code} />;
                  }

                  return !inline && match ? (
                    <SyntaxHighlighter
                      style={vscDarkPlus as any}
                      language={match[1]}
                      PreTag="div"
                      {...props}
                    >
                      {code}
                    </SyntaxHighlighter>
                  ) : (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                },
              }}
            >
              {selectedRule.content}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="text-gray-500">
            <h3 className="text-lg font-semibold mb-2">Rules</h3>
            <p className="mb-4">
              Select a rule from the sidebar to view its content.
            </p>
            <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded">
              <h4 className="font-semibold mb-2">What are Rules?</h4>
              <p className="text-sm mb-2">
                Rules (CLAUDE.md and rules/*.md files) contain context and instructions that Claude sees when working in your project.
                They help provide project-specific guidelines, conventions, and documentation.
              </p>
              <h4 className="font-semibold mb-2 mt-4">File Hierarchy:</h4>
              <ul className="text-sm list-disc ml-4">
                <li>
                  <strong>Global</strong> (~/.claude/CLAUDE.md): Applies to all projects
                </li>
                <li>
                  <strong>Global Rules</strong> (~/.claude/rules/*.md): Modular global rules
                </li>
                <li>
                  <strong>Project</strong> (./CLAUDE.md): Applies to current project root
                </li>
                <li>
                  <strong>Project Rules</strong> (./.claude/rules/*.md): Modular project rules
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
