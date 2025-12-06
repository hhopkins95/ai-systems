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
import type { ClaudeConfig, Skill, Command, Agent, Hook, EntitySource, ClaudeMdNode, ClaudeMdFile } from '@/types';
import SourceBadge from './SourceBadge';
import SkillModal from './SkillModal';
import CommandModal from './CommandModal';
import AgentModal from './AgentModal';
import Mermaid from './Mermaid';
import { io } from 'socket.io-client';

type DocumentType = 'skills' | 'commands' | 'agents' | 'hooks' | 'memory';
type SourceType = 'global' | 'project' | 'plugin';

// Interface for grouped entities with nested plugin structure
interface GroupedEntities<T> {
  global: T[];
  project: T[];
  plugin: T[];
  pluginsBySource: Record<string, T[]>; // Grouped by pluginId
}

export default function AgentProfileTab() {
  const [config, setConfig] = useState<ClaudeConfig | null>(null);
  const [activeTab, setActiveTab] = useState<DocumentType>('skills');
  const [loading, setLoading] = useState(true);

  // Track expanded plugin sections
  const [expandedPlugins, setExpandedPlugins] = useState<Record<string, boolean>>({});

  // Modal state
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [selectedCommand, setSelectedCommand] = useState<Command | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  // Memory Files state (from ContextTab)
  const [memoryTree, setMemoryTree] = useState<ClaudeMdNode[]>([]);
  const [selectedMemoryFile, setSelectedMemoryFile] = useState<ClaudeMdFile | null>(null);

  useEffect(() => {
    fetchConfig();
    fetchMemoryTree();

    // Set up socket for real-time updates to CLAUDE.md files
    const socket = io();
    socket.on('file-change', (event: any) => {
      if (event.area === 'claude' && event.path.includes('CLAUDE.md')) {
        fetchMemoryTree();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/claude/all?includeContents=true');
      const data = await res.json();
      setConfig(data);
    } catch (error) {
      console.error('Failed to fetch config:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMemoryTree = async () => {
    try {
      const response = await fetch('/api/claude/context');
      const data = await response.json();
      setMemoryTree(data);
    } catch (error) {
      console.error('Failed to fetch CLAUDE.md tree:', error);
    }
  };

  // Group items by their source type, with nested plugin grouping
  const groupBySource = <T extends { source: EntitySource }>(items: T[]): GroupedEntities<T> => {
    const grouped: GroupedEntities<T> = {
      global: [],
      project: [],
      plugin: [],
      pluginsBySource: {},
    };

    items.forEach(item => {
      grouped[item.source.type].push(item);

      // Also group plugin items by their pluginId
      if (item.source.type === 'plugin' && item.source.pluginId) {
        if (!grouped.pluginsBySource[item.source.pluginId]) {
          grouped.pluginsBySource[item.source.pluginId] = [];
        }
        grouped.pluginsBySource[item.source.pluginId].push(item);
      }
    });

    return grouped;
  };

  // Toggle plugin section expansion
  const togglePluginExpanded = (pluginId: string) => {
    setExpandedPlugins(prev => ({
      ...prev,
      [pluginId]: !prev[pluginId],
    }));
  };

  // Generic render function for entity items
  const renderEntityItem = <T extends { name: string; source: EntitySource; description?: string }>(
    item: T,
    onClick: () => void,
    extra?: React.ReactNode
  ) => (
    <button
      className="w-full border border-gray-200 dark:border-gray-700 rounded p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-2">
        <h4 className="font-semibold">{item.name}</h4>
        <SourceBadge source={item.source} />
      </div>
      {item.description && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          {item.description}
        </p>
      )}
      {extra}
    </button>
  );

  // Render plugin section with collapsible groups
  const renderPluginSection = <T extends { name: string; source: EntitySource; description?: string }>(
    pluginsBySource: Record<string, T[]>,
    renderItem: (item: T) => React.ReactNode,
    entityType: string
  ) => {
    const pluginIds = Object.keys(pluginsBySource).sort();
    if (pluginIds.length === 0) return null;

    const totalCount = pluginIds.reduce((sum, id) => sum + pluginsBySource[id].length, 0);

    return (
      <div>
        <h3 className="text-lg font-semibold mb-3">Plugin {entityType} ({totalCount})</h3>
        <div className="space-y-2">
          {pluginIds.map(pluginId => {
            const items = pluginsBySource[pluginId];
            const isExpanded = expandedPlugins[`${entityType}-${pluginId}`] ?? true;

            return (
              <div key={pluginId} className="border border-gray-200 dark:border-gray-700 rounded">
                <button
                  className="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  onClick={() => togglePluginExpanded(`${entityType}-${pluginId}`)}
                >
                  <div className="flex items-center gap-2">
                    <span className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                      ▶
                    </span>
                    <span className="font-medium text-purple-700 dark:text-purple-300">{pluginId}</span>
                    <span className="text-sm text-gray-500">({items.length})</span>
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t border-gray-200 dark:border-gray-700 p-3 space-y-3">
                    {items.map((item, idx) => (
                      <div key={idx}>{renderItem(item)}</div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderSkills = () => {
    if (!config) return null;

    const grouped = groupBySource(config.skills);

    return (
      <div className="space-y-6">
        {/* Global Skills */}
        {grouped.global.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-3">Global Skills ({grouped.global.length})</h3>
            <div className="space-y-4">
              {grouped.global.map((skill, idx) => (
                <div key={idx}>
                  {renderEntityItem(skill, () => setSelectedSkill(skill), (
                    <p className="text-xs text-gray-500 mt-2">{skill.files.length} file(s)</p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Project Skills */}
        {grouped.project.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-3">Project Skills ({grouped.project.length})</h3>
            <div className="space-y-4">
              {grouped.project.map((skill, idx) => (
                <div key={idx}>
                  {renderEntityItem(skill, () => setSelectedSkill(skill), (
                    <p className="text-xs text-gray-500 mt-2">{skill.files.length} file(s)</p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Plugin Skills - Nested by plugin */}
        {renderPluginSection(
          grouped.pluginsBySource,
          (skill) => renderEntityItem(skill, () => setSelectedSkill(skill), (
            <p className="text-xs text-gray-500 mt-2">{skill.files.length} file(s)</p>
          )),
          'Skills'
        )}
      </div>
    );
  };

  const renderCommands = () => {
    if (!config) return null;

    const grouped = groupBySource(config.commands);

    // Custom render for commands (shows /{name})
    const renderCommandItem = (command: Command) => (
      <button
        className="w-full border border-gray-200 dark:border-gray-700 rounded p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
        onClick={() => setSelectedCommand(command)}
      >
        <div className="flex items-center gap-2 mb-2">
          <h4 className="font-semibold">/{command.name}</h4>
          <SourceBadge source={command.source} />
        </div>
        {command.description && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {command.description}
          </p>
        )}
      </button>
    );

    return (
      <div className="space-y-6">
        {/* Global Commands */}
        {grouped.global.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-3">Global Commands ({grouped.global.length})</h3>
            <div className="space-y-4">
              {grouped.global.map((command, idx) => (
                <div key={idx}>{renderCommandItem(command)}</div>
              ))}
            </div>
          </div>
        )}

        {/* Project Commands */}
        {grouped.project.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-3">Project Commands ({grouped.project.length})</h3>
            <div className="space-y-4">
              {grouped.project.map((command, idx) => (
                <div key={idx}>{renderCommandItem(command)}</div>
              ))}
            </div>
          </div>
        )}

        {/* Plugin Commands - Nested by plugin */}
        {renderPluginSection(
          grouped.pluginsBySource,
          renderCommandItem,
          'Commands'
        )}
      </div>
    );
  };

  const renderAgents = () => {
    if (!config) return null;

    const grouped = groupBySource(config.agents);

    return (
      <div className="space-y-6">
        {/* Global Agents */}
        {grouped.global.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-3">Global Agents ({grouped.global.length})</h3>
            <div className="space-y-4">
              {grouped.global.map((agent, idx) => (
                <div key={idx}>
                  {renderEntityItem(agent, () => setSelectedAgent(agent))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Project Agents */}
        {grouped.project.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-3">Project Agents ({grouped.project.length})</h3>
            <div className="space-y-4">
              {grouped.project.map((agent, idx) => (
                <div key={idx}>
                  {renderEntityItem(agent, () => setSelectedAgent(agent))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Plugin Agents - Nested by plugin */}
        {renderPluginSection(
          grouped.pluginsBySource,
          (agent) => renderEntityItem(agent, () => setSelectedAgent(agent)),
          'Agents'
        )}
      </div>
    );
  };

  const renderHooks = () => {
    if (!config) return null;

    const grouped = groupBySource(config.hooks);

    // Custom render for hooks (shows configuration)
    const renderHookItem = (hook: Hook) => (
      <div className="border border-gray-200 dark:border-gray-700 rounded p-4">
        <div className="flex items-center gap-2 mb-2">
          <h4 className="font-semibold">{hook.name}</h4>
          <SourceBadge source={hook.source} />
        </div>
        <details className="mt-2">
          <summary className="cursor-pointer text-sm text-blue-600 dark:text-blue-400">
            View configuration
          </summary>
          <SyntaxHighlighter
            language="json"
            style={vscDarkPlus as any}
            className="mt-2 text-xs"
          >
            {JSON.stringify(hook.hooks, null, 2)}
          </SyntaxHighlighter>
        </details>
      </div>
    );

    return (
      <div className="space-y-6">
        {/* Global Hooks */}
        {grouped.global.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-3">Global Hooks ({grouped.global.length})</h3>
            <div className="space-y-4">
              {grouped.global.map((hook, idx) => (
                <div key={idx}>{renderHookItem(hook)}</div>
              ))}
            </div>
          </div>
        )}

        {/* Project Hooks */}
        {grouped.project.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-3">Project Hooks ({grouped.project.length})</h3>
            <div className="space-y-4">
              {grouped.project.map((hook, idx) => (
                <div key={idx}>{renderHookItem(hook)}</div>
              ))}
            </div>
          </div>
        )}

        {/* Plugin Hooks - Nested by plugin */}
        {renderPluginSection(
          grouped.pluginsBySource,
          renderHookItem,
          'Hooks'
        )}
      </div>
    );
  };

  // Memory Files rendering (from ContextTab)
  const getScopeBadgeStyle = (scope: 'global' | 'project' | 'nested') => {
    const styles = {
      global: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      project: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      nested: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    };
    return styles[scope];
  };

  const renderMemoryTree = (node: ClaudeMdNode, depth: number = 0) => {
    if (node.type === 'file' && node.file) {
      return (
        <div
          key={node.path}
          className={`cursor-pointer px-3 py-1 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2 ${
            selectedMemoryFile?.path === node.path ? 'bg-blue-100 dark:bg-blue-900' : ''
          }`}
          onClick={() => setSelectedMemoryFile(node.file!)}
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
          {node.children?.map(child => renderMemoryTree(child, depth + 1))}
        </div>
      </details>
    );
  };

  const renderMemoryFiles = () => {
    return (
      <div className="flex h-full -m-6">
        {/* Sidebar */}
        <div className="w-80 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
          <div className="p-4">
            <h3 className="font-bold mb-2">CLAUDE.md Files</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Project context and instructions for Claude
            </p>
            {memoryTree.length > 0 ? (
              memoryTree.map(node => renderMemoryTree(node))
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
          {selectedMemoryFile ? (
            <div className="prose dark:prose-invert max-w-none">
              {/* File info header */}
              <div className="mb-6 p-4 bg-gray-100 dark:bg-gray-800 rounded">
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="text-xl font-bold mt-0 mb-0">CLAUDE.md</h2>
                  <span className={`text-xs px-2 py-1 rounded ${getScopeBadgeStyle(selectedMemoryFile.scope)}`}>
                    {selectedMemoryFile.scope}
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-0">
                  📂 {selectedMemoryFile.relativePath}
                </p>
                {selectedMemoryFile.directoryPath && (
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1 mb-0">
                    Applies to: {selectedMemoryFile.directoryPath}
                  </p>
                )}
              </div>

              {/* Frontmatter display */}
              {selectedMemoryFile.frontmatter && Object.keys(selectedMemoryFile.frontmatter).length > 0 && (
                <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-950 rounded">
                  <h3 className="text-sm font-bold text-blue-900 dark:text-blue-100 mt-0 mb-2">
                    Metadata
                  </h3>
                  {selectedMemoryFile.frontmatter.title && (
                    <div className="mb-2">
                      <span className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                        Title:
                      </span>{' '}
                      <span className="text-sm text-blue-700 dark:text-blue-300">
                        {selectedMemoryFile.frontmatter.title}
                      </span>
                    </div>
                  )}
                  {selectedMemoryFile.frontmatter.description && (
                    <div className="mb-2">
                      <span className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                        Description:
                      </span>{' '}
                      <span className="text-sm text-blue-700 dark:text-blue-300">
                        {selectedMemoryFile.frontmatter.description}
                      </span>
                    </div>
                  )}
                  {Object.entries(selectedMemoryFile.frontmatter).map(([key, value]) => {
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
                {selectedMemoryFile.content}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="text-gray-500">
              <h3 className="text-lg font-semibold mb-2">CLAUDE.md Memory Files</h3>
              <p className="mb-4">
                Select a CLAUDE.md file from the sidebar to view its content.
              </p>
              <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded">
                <h4 className="font-semibold mb-2">What are Memory Files?</h4>
                <p className="text-sm mb-2">
                  Memory files (CLAUDE.md) contain context and instructions that Claude sees when working in your project.
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
  };

  if (loading) {
    return <div className="p-4">Loading...</div>;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'skills':
        return renderSkills();
      case 'commands':
        return renderCommands();
      case 'agents':
        return renderAgents();
      case 'hooks':
        return renderHooks();
      case 'memory':
        return renderMemoryFiles();
    }
  };

  const tabs: Array<{ id: DocumentType; label: string; count?: number }> = [
    { id: 'skills', label: 'Skills', count: config?.skills.length },
    { id: 'commands', label: 'Commands', count: config?.commands.length },
    { id: 'agents', label: 'Agents', count: config?.agents.length },
    { id: 'hooks', label: 'Hooks', count: config?.hooks.length },
    { id: 'memory', label: 'Memory Files', count: memoryTree.length },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <div className="flex">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`px-4 py-2 font-medium ${
                activeTab === tab.id
                  ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="ml-2 text-xs">
                  ({tab.count})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {renderContent()}
      </div>

      {/* Modals */}
      <SkillModal
        skill={selectedSkill}
        isOpen={selectedSkill !== null}
        onClose={() => setSelectedSkill(null)}
      />
      <CommandModal
        command={selectedCommand}
        isOpen={selectedCommand !== null}
        onClose={() => setSelectedCommand(null)}
      />
      <AgentModal
        agent={selectedAgent}
        isOpen={selectedAgent !== null}
        onClose={() => setSelectedAgent(null)}
      />
    </div>
  );
}
