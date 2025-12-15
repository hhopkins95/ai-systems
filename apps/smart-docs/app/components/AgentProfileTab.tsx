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
import type { AgentContext, Skill, SkillWithSource, Command, CommandWithSource, Agent, AgentWithSource, Hook, HookWithSource, EntitySource, RuleWithSource, McpServerWithSource } from '@/types';
import SourceBadge from './SourceBadge';
import SkillModal from './SkillModal';
import CommandModal from './CommandModal';
import AgentModal from './AgentModal';
import McpServerModal from './McpServerModal';
import Mermaid from './Mermaid';
import ConfirmDialog from './ConfirmDialog';
import { io } from 'socket.io-client';

type DocumentType = 'skills' | 'commands' | 'agents' | 'hooks' | 'memory' | 'mcp';
type SourceType = 'global' | 'project' | 'plugin';

// Interface for grouped entities with nested plugin structure
interface GroupedEntities<T> {
  global: T[];
  project: T[];
  plugin: T[];
  pluginsBySource: Record<string, T[]>; // Grouped by pluginId
}

export default function AgentProfileTab() {
  const [config, setConfig] = useState<AgentContext | null>(null);
  const [activeTab, setActiveTab] = useState<DocumentType>('skills');
  const [loading, setLoading] = useState(true);

  // Track expanded plugin sections
  const [expandedPlugins, setExpandedPlugins] = useState<Record<string, boolean>>({});

  // Modal state
  const [selectedSkill, setSelectedSkill] = useState<SkillWithSource | null>(null);
  const [selectedCommand, setSelectedCommand] = useState<CommandWithSource | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentWithSource | null>(null);

  // Rules state (from ContextTab)
  const [rulesTree, setRulesTree] = useState<RuleWithSource[]>([]);
  const [selectedRule, setSelectedRule] = useState<RuleWithSource | null>(null);

  // MCP Servers state
  const [mcpServers, setMcpServers] = useState<McpServerWithSource[]>([]);
  const [selectedMcpServer, setSelectedMcpServer] = useState<McpServerWithSource | null>(null);
  const [showMcpModal, setShowMcpModal] = useState(false);
  const [mcpConfirmDialog, setMcpConfirmDialog] = useState<{
    isOpen: boolean;
    serverName: string;
  }>({ isOpen: false, serverName: '' });

  useEffect(() => {
    fetchConfig();
    fetchRulesTree();
    fetchMcpServers();

    // Set up socket for real-time updates
    const socket = io();
    socket.on('file-change', (event: any) => {
      if (event.area === 'claude') {
        if (event.path.includes('CLAUDE.md') || event.path.includes('/rules/')) {
          fetchRulesTree();
        }
        if (event.path.includes('.mcp.json')) {
          fetchMcpServers();
        }
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

  const fetchRulesTree = async () => {
    try {
      const response = await fetch('/api/claude/context');
      const data = await response.json();
      setRulesTree(data);
    } catch (error) {
      console.error('Failed to fetch rules:', error);
    }
  };

  const fetchMcpServers = async () => {
    try {
      const response = await fetch('/api/mcp/list');
      const data = await response.json();
      setMcpServers(data.mcpServers || []);
    } catch (error) {
      console.error('Failed to fetch MCP servers:', error);
    }
  };

  const handleDeleteMcpServer = async (serverName: string) => {
    try {
      const response = await fetch('/api/mcp/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: serverName }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete MCP server');
      }

      fetchMcpServers();
    } catch (error) {
      console.error('Failed to delete MCP server:', error);
    } finally {
      setMcpConfirmDialog({ isOpen: false, serverName: '' });
    }
  };

  // Group items by their source type, with nested plugin grouping
  const groupBySource = <T extends { name: string; source?: EntitySource; description?: string }>(items: T[]): GroupedEntities<T> => {
    const grouped: GroupedEntities<T> = {
      global: [],
      project: [],
      plugin: [],
      pluginsBySource: {},
    };

    items.forEach(item => {
      const sourceType: SourceType = item.source?.type ?? 'project';
      grouped[sourceType].push(item);

      // Also group plugin items by their pluginId
      if (item.source?.type === 'plugin' && item.source.pluginId) {
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
  const renderEntityItem = <T extends { name: string; source?: EntitySource; description?: string }>(
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
        {item.source && <SourceBadge source={item.source} />}
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
  const renderPluginSection = <T extends { name: string; source?: EntitySource; description?: string }>(
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

    const grouped = groupBySource(config.skills) as GroupedEntities<SkillWithSource>;

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

    const grouped = groupBySource(config.commands) as GroupedEntities<CommandWithSource>;

    // Custom render for commands (shows /{name})
    const renderCommandItem = (command: CommandWithSource) => (
      <button
        className="w-full border border-gray-200 dark:border-gray-700 rounded p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
        onClick={() => setSelectedCommand(command)}
      >
        <div className="flex items-center gap-2 mb-2">
          <h4 className="font-semibold">/{command.name}</h4>
          <SourceBadge source={command.source} />
        </div>
        {command.metadata?.description && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {command.metadata.description}
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

    const grouped = groupBySource(config.subagents) as GroupedEntities<AgentWithSource>;

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

    const grouped = groupBySource(config.hooks) as GroupedEntities<HookWithSource>;

    // Custom render for hooks (shows configuration)
    const renderHookItem = (hook: HookWithSource) => (
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

  // MCP Servers rendering
  const renderMcpServers = () => {
    const grouped = groupBySource(mcpServers);

    // Determine if server is HTTP type
    const isHttpServer = (server: McpServerWithSource) =>
      server.type === 'http' || (!('command' in server) && 'url' in server);

    const renderMcpItem = (server: McpServerWithSource, canModify: boolean) => {
      const isHttp = isHttpServer(server);
      const serverType = isHttp ? 'http' : 'stdio';

      return (
        <div className="border border-gray-200 dark:border-gray-700 rounded p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold">{server.name}</h4>
              <span className={`text-xs px-2 py-0.5 rounded ${
                isHttp
                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                  : 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200'
              }`}>
                {serverType}
              </span>
              <SourceBadge source={server.source} />
            </div>
            {canModify && (
              <div className="flex gap-2">
                <button
                  className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400"
                  onClick={() => {
                    setSelectedMcpServer(server);
                    setShowMcpModal(true);
                  }}
                >
                  Edit
                </button>
                <button
                  className="text-sm text-red-600 hover:text-red-800 dark:text-red-400"
                  onClick={() => setMcpConfirmDialog({ isOpen: true, serverName: server.name })}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
            {/* HTTP Server: Show URL and headers */}
            {isHttp ? (
              <>
                <p><span className="font-medium">URL:</span> {server.url}</p>
                {server.headers && Object.keys(server.headers).length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-blue-600 dark:text-blue-400">
                      Headers ({Object.keys(server.headers).length})
                    </summary>
                    <div className="mt-1 pl-2 text-xs">
                      {Object.entries(server.headers).map(([key, value]) => (
                        <p key={key}><span className="font-mono">{key}</span>: <span className="font-mono">{value}</span></p>
                      ))}
                    </div>
                  </details>
                )}
              </>
            ) : (
              <>
                {/* Stdio Server: Show command, args, env */}
                <p><span className="font-medium">Command:</span> {server.command}</p>
                {server.args && server.args.length > 0 && (
                  <p><span className="font-medium">Args:</span> {server.args.join(' ')}</p>
                )}
                {server.env && Object.keys(server.env).length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-blue-600 dark:text-blue-400">
                      Environment Variables ({Object.keys(server.env).length})
                    </summary>
                    <div className="mt-1 pl-2 text-xs">
                      {Object.entries(server.env).map(([key, value]) => (
                        <p key={key}><span className="font-mono">{key}</span>=<span className="font-mono">{value}</span></p>
                      ))}
                    </div>
                  </details>
                )}
              </>
            )}
          </div>
        </div>
      );
    };

    return (
      <div className="space-y-6">
        {/* Add MCP Server button */}
        <div className="flex justify-end">
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            onClick={() => {
              setSelectedMcpServer(null);
              setShowMcpModal(true);
            }}
          >
            + Add MCP Server
          </button>
        </div>

        {/* Global MCP Servers */}
        {grouped.global.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-3">Global MCP Servers ({grouped.global.length})</h3>
            <p className="text-sm text-gray-500 mb-3">Configured in ~/.claude/.mcp.json</p>
            <div className="space-y-4">
              {grouped.global.map((server, idx) => (
                <div key={idx}>{renderMcpItem(server, false)}</div>
              ))}
            </div>
          </div>
        )}

        {/* Project MCP Servers */}
        {grouped.project.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-3">Project MCP Servers ({grouped.project.length})</h3>
            <p className="text-sm text-gray-500 mb-3">Configured in .claude/.mcp.json</p>
            <div className="space-y-4">
              {grouped.project.map((server, idx) => (
                <div key={idx}>{renderMcpItem(server, true)}</div>
              ))}
            </div>
          </div>
        )}

        {/* Plugin MCP Servers */}
        {Object.keys(grouped.pluginsBySource).length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-3">Plugin MCP Servers</h3>
            <div className="space-y-2">
              {Object.entries(grouped.pluginsBySource).map(([pluginId, servers]) => {
                const isExpanded = expandedPlugins[`mcp-${pluginId}`] ?? true;
                return (
                  <div key={pluginId} className="border border-gray-200 dark:border-gray-700 rounded">
                    <button
                      className="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      onClick={() => togglePluginExpanded(`mcp-${pluginId}`)}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                          ▶
                        </span>
                        <span className="font-medium text-purple-700 dark:text-purple-300">{pluginId}</span>
                        <span className="text-sm text-gray-500">({servers.length})</span>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-gray-200 dark:border-gray-700 p-3 space-y-3">
                        {servers.map((server, idx) => (
                          <div key={idx}>{renderMcpItem(server, false)}</div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {mcpServers.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p className="mb-2">No MCP servers configured</p>
            <p className="text-sm">
              MCP (Model Context Protocol) servers extend Claude&apos;s capabilities with tools and resources.
            </p>
          </div>
        )}
      </div>
    );
  };

  // Memory Files rendering (from ContextTab)
  const getScopeBadgeStyle = (scope?: 'global' | 'project' | 'plugin') => {
    const styles: Record<string, string> = {
      global: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      project: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      plugin: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    };
    return scope ? styles[scope] || styles.project : styles.project;
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

  const renderRules = () => {
    return (
      <div className="flex h-full -m-6">
        {/* Sidebar */}
        <div className="w-80 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
          <div className="p-4">
            <h3 className="font-bold mb-2">Rules</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Project context and instructions for Claude
            </p>
            {rulesTree.length > 0 ? (
              rulesTree.map(rule => renderRuleItem(rule))
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
        return renderRules();
      case 'mcp':
        return renderMcpServers();
    }
  };

  const tabs: Array<{ id: DocumentType; label: string; count?: number }> = [
    { id: 'skills', label: 'Skills', count: config?.skills.length },
    { id: 'commands', label: 'Commands', count: config?.commands.length },
    { id: 'agents', label: 'Agents', count: config?.subagents.length },
    { id: 'hooks', label: 'Hooks', count: config?.hooks.length },
    { id: 'memory', label: 'Memory Files', count: memoryTree.length },
    { id: 'mcp', label: 'MCP Servers', count: mcpServers.length },
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
      <McpServerModal
        isOpen={showMcpModal}
        onClose={() => {
          setShowMcpModal(false);
          setSelectedMcpServer(null);
        }}
        onSave={fetchMcpServers}
        server={selectedMcpServer}
      />
      <ConfirmDialog
        isOpen={mcpConfirmDialog.isOpen}
        title="Delete MCP Server"
        message={`Are you sure you want to delete the MCP server "${mcpConfirmDialog.serverName}"? This action cannot be undone.`}
        onConfirm={() => handleDeleteMcpServer(mcpConfirmDialog.serverName)}
        onCancel={() => setMcpConfirmDialog({ isOpen: false, serverName: '' })}
        isDestructive
      />
    </div>
  );
}
