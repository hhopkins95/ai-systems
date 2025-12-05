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
import type { FileTreeNode, MarkdownContent } from '@/types';
import Mermaid from './Mermaid';

export default function DocsTab() {
  const [tree, setTree] = useState<FileTreeNode | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [content, setContent] = useState<MarkdownContent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTree();
  }, []);

  const fetchTree = async () => {
    try {
      const response = await fetch('/api/docs/tree');
      const data = await response.json();
      setTree(data.tree);
    } catch (error) {
      console.error('Failed to fetch tree:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchContent = async (path: string) => {
    try {
      const response = await fetch(`/api/docs/content?path=${encodeURIComponent(path)}`);
      const data = await response.json();
      setContent(data);
      setSelectedFile(path);
    } catch (error) {
      console.error('Failed to fetch content:', error);
    }
  };

  const renderTree = (node: FileTreeNode) => {
    if (node.type === 'file') {
      return (
        <div
          key={node.path}
          className={`cursor-pointer px-3 py-1 hover:bg-gray-100 dark:hover:bg-gray-800 ${
            selectedFile === node.path ? 'bg-blue-100 dark:bg-blue-900' : ''
          }`}
          onClick={() => fetchContent(node.path)}
        >
          📄 {node.name}
        </div>
      );
    }

    return (
      <details key={node.path} open>
        <summary className="cursor-pointer px-3 py-1 hover:bg-gray-100 dark:hover:bg-gray-800">
          📁 {node.name}
        </summary>
        <div className="ml-4">
          {node.children?.map(child => renderTree(child))}
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
      <div className="w-64 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
        <div className="p-4">
          <h3 className="font-bold mb-2">Documentation</h3>
          {tree && renderTree(tree)}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {content ? (
          <div className="prose dark:prose-invert max-w-none">
            {content.frontmatter && (
              <div className="mb-4 p-4 bg-gray-100 dark:bg-gray-800 rounded">
                {content.frontmatter.title && (
                  <h1 className="mt-0">{content.frontmatter.title}</h1>
                )}
                {content.frontmatter.description && (
                  <p className="text-gray-600 dark:text-gray-400">
                    {content.frontmatter.description}
                  </p>
                )}
              </div>
            )}
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
              {content.content}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="text-gray-500">Select a file to view its content</div>
        )}
      </div>
    </div>
  );
}
