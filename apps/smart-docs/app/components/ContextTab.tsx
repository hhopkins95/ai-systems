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
import type { ClaudeMdNode, ClaudeMdFile } from '@/types';
import Mermaid from './Mermaid';
import { io } from 'socket.io-client';

export default function ContextTab() {
  const [tree, setTree] = useState<ClaudeMdNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<ClaudeMdFile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTree();

    // Set up socket for real-time updates
    const socket = io();
    socket.on('file-change', (event: any) => {
      if (event.area === 'claude' && event.path.includes('CLAUDE.md')) {
        fetchTree();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const fetchTree = async () => {
    try {
      const response = await fetch('/api/claude/context');
      const data = await response.json();
      setTree(data);
    } catch (error) {
      console.error('Failed to fetch CLAUDE.md tree:', error);
    } finally {
      setLoading(false);
    }
  };

  const getScopeBadgeStyle = (scope: 'global' | 'project' | 'nested') => {
    const styles = {
      global: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      project: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      nested: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    };
    return styles[scope];
  };

  const renderTree = (node: ClaudeMdNode, depth: number = 0) => {
    if (node.type === 'file' && node.file) {
      return (
        <div
          key={node.path}
          className={`cursor-pointer px-3 py-1 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2 ${
            selectedFile?.path === node.path ? 'bg-blue-100 dark:bg-blue-900' : ''
          }`}
          onClick={() => setSelectedFile(node.file!)}
        >
          <span>📋 {node.name}</span>
          <span className={`text-xs px-2 py-0.5 rounded ${getScopeBadgeStyle(node.file.scope)}`}>
            {node.file.scope}
          </span>
        </div>
      );
    }

    return (
      <details key={node.path} open>
        <summary className="cursor-pointer px-3 py-1 hover:bg-gray-100 dark:hover:bg-gray-800">
          📁 {node.name}
        </summary>
        <div className="ml-4">
          {node.children?.map(child => renderTree(child, depth + 1))}
        </div>
      </details>
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
          <h3 className="font-bold mb-2">CLAUDE.md Files</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Project context and instructions for Claude
          </p>
          {tree.length > 0 ? (
            tree.map(node => renderTree(node))
          ) : (
            <div className="text-gray-500 text-sm">
              No CLAUDE.md files found.
              <div className="mt-2 text-xs">
                <p>Create CLAUDE.md files at:</p>
                <ul className="list-disc ml-4 mt-1">
                  <li>~/.claude/CLAUDE.md (global)</li>
                  <li>./CLAUDE.md (project root)</li>
                  <li>./subdirectory/CLAUDE.md (nested)</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {selectedFile ? (
          <div className="prose dark:prose-invert max-w-none">
            {/* File info header */}
            <div className="mb-6 p-4 bg-gray-100 dark:bg-gray-800 rounded">
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-xl font-bold mt-0 mb-0">CLAUDE.md</h2>
                <span className={`text-xs px-2 py-1 rounded ${getScopeBadgeStyle(selectedFile.scope)}`}>
                  {selectedFile.scope}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-0">
                📂 {selectedFile.relativePath}
              </p>
              {selectedFile.directoryPath && (
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1 mb-0">
                  Applies to: {selectedFile.directoryPath}
                </p>
              )}
            </div>

            {/* Frontmatter display */}
            {selectedFile.frontmatter && Object.keys(selectedFile.frontmatter).length > 0 && (
              <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-950 rounded">
                <h3 className="text-sm font-bold text-blue-900 dark:text-blue-100 mt-0 mb-2">
                  Metadata
                </h3>
                {selectedFile.frontmatter.title && (
                  <div className="mb-2">
                    <span className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                      Title:
                    </span>{' '}
                    <span className="text-sm text-blue-700 dark:text-blue-300">
                      {selectedFile.frontmatter.title}
                    </span>
                  </div>
                )}
                {selectedFile.frontmatter.description && (
                  <div className="mb-2">
                    <span className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                      Description:
                    </span>{' '}
                    <span className="text-sm text-blue-700 dark:text-blue-300">
                      {selectedFile.frontmatter.description}
                    </span>
                  </div>
                )}
                {Object.entries(selectedFile.frontmatter).map(([key, value]) => {
                  if (key !== 'title' && key !== 'description') {
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
              {selectedFile.content}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="text-gray-500">
            <h3 className="text-lg font-semibold mb-2">CLAUDE.md Context Files</h3>
            <p className="mb-4">
              Select a CLAUDE.md file from the sidebar to view its content.
            </p>
            <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded">
              <h4 className="font-semibold mb-2">What are CLAUDE.md files?</h4>
              <p className="text-sm mb-2">
                CLAUDE.md files contain context and instructions that Claude sees when working in your project.
                They help provide project-specific guidelines, conventions, and documentation.
              </p>
              <h4 className="font-semibold mb-2 mt-4">File Hierarchy:</h4>
              <ul className="text-sm list-disc ml-4">
                <li>
                  <strong>Global</strong> (~/.claude/CLAUDE.md): Applies to all projects
                </li>
                <li>
                  <strong>Project</strong> (./CLAUDE.md): Applies to current project root
                </li>
                <li>
                  <strong>Nested</strong> (./subdirectory/CLAUDE.md): Applies to specific subdirectories
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
