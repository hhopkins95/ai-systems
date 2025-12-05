'use client';

import { useState, useEffect, useMemo } from 'react';
import { Prism as SyntaxHighlighterBase } from 'react-syntax-highlighter';
// Cast to any to avoid React 19 JSX type incompatibility
const SyntaxHighlighter = SyntaxHighlighterBase as any;
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { Plugin, ClaudeConfig, Skill, Command, Agent } from '@/types';
import SkillModal from './SkillModal';
import CommandModal from './CommandModal';
import AgentModal from './AgentModal';

type EntityType = 'skills' | 'commands' | 'agents';

const ALL_MARKETPLACES = '__all__';
const STANDALONE = '__standalone__';

export default function PluginsTab() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPlugins, setExpandedPlugins] = useState<Record<string, ClaudeConfig>>({});
  const [loadingContents, setLoadingContents] = useState<Record<string, boolean>>({});
  const [activeEntityTab, setActiveEntityTab] = useState<Record<string, EntityType>>({});
  const [activeMarketplace, setActiveMarketplace] = useState<string>(ALL_MARKETPLACES);

  // Modal state
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [selectedCommand, setSelectedCommand] = useState<Command | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  // Group plugins by marketplace
  const { marketplaces, pluginsByMarketplace, filteredPlugins } = useMemo(() => {
    const byMarketplace: Record<string, Plugin[]> = {};

    for (const plugin of plugins) {
      const key = plugin.marketplace || STANDALONE;
      if (!byMarketplace[key]) {
        byMarketplace[key] = [];
      }
      byMarketplace[key].push(plugin);
    }

    // Sort marketplaces alphabetically, but put standalone at the end
    const marketplaceList = Object.keys(byMarketplace).sort((a, b) => {
      if (a === STANDALONE) return 1;
      if (b === STANDALONE) return -1;
      return a.localeCompare(b);
    });

    // Get filtered plugins based on active marketplace
    const filtered = activeMarketplace === ALL_MARKETPLACES
      ? plugins
      : byMarketplace[activeMarketplace] || [];

    return {
      marketplaces: marketplaceList,
      pluginsByMarketplace: byMarketplace,
      filteredPlugins: filtered,
    };
  }, [plugins, activeMarketplace]);

  useEffect(() => {
    fetchPlugins();
  }, []);

  const fetchPlugins = async () => {
    try {
      const response = await fetch('/api/plugins/list');
      const data = await response.json();
      setPlugins(data.plugins);
    } catch (error) {
      console.error('Failed to fetch plugins:', error);
    } finally {
      setLoading(false);
    }
  };

  const togglePlugin = async (pluginId: string, enabled: boolean) => {
    try {
      const response = await fetch('/api/plugins/toggle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pluginId, enabled }),
      });

      if (response.ok) {
        // Update local state
        setPlugins(plugins.map(p =>
          p.id === pluginId ? { ...p, enabled } : p
        ));
      }
    } catch (error) {
      console.error('Failed to toggle plugin:', error);
    }
  };

  const loadPluginContents = async (plugin: Plugin) => {
    if (expandedPlugins[plugin.id]) {
      // Already loaded, just toggle
      return;
    }

    setLoadingContents({ ...loadingContents, [plugin.id]: true });

    try {
      const response = await fetch('/api/plugins/contents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pluginPath: plugin.path,
          pluginId: plugin.id,
          marketplace: plugin.marketplace,
          includeContents: true,
        }),
      });

      const config = await response.json();
      setExpandedPlugins({ ...expandedPlugins, [plugin.id]: config });
    } catch (error) {
      console.error('Failed to fetch plugin contents:', error);
    } finally {
      setLoadingContents({ ...loadingContents, [plugin.id]: false });
    }
  };

  if (loading) {
    return <div className="p-4">Loading...</div>;
  }

  const getMarketplaceLabel = (marketplace: string) => {
    if (marketplace === ALL_MARKETPLACES) return 'All';
    if (marketplace === STANDALONE) return 'Standalone';
    return marketplace;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Marketplace tabs */}
      {marketplaces.length > 0 && (
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 pt-4">
          <div className="flex gap-1 overflow-x-auto">
            <button
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                activeMarketplace === ALL_MARKETPLACES
                  ? 'bg-white dark:bg-gray-800 border border-b-0 border-gray-200 dark:border-gray-700 text-blue-600 dark:text-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
              onClick={() => setActiveMarketplace(ALL_MARKETPLACES)}
            >
              All ({plugins.length})
            </button>
            {marketplaces.map((marketplace) => (
              <button
                key={marketplace}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                  activeMarketplace === marketplace
                    ? 'bg-white dark:bg-gray-800 border border-b-0 border-gray-200 dark:border-gray-700 text-blue-600 dark:text-blue-400'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                onClick={() => setActiveMarketplace(marketplace)}
              >
                {getMarketplaceLabel(marketplace)} ({pluginsByMarketplace[marketplace]?.length || 0})
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-8">
        {/* Plugins list */}
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            All plugins are installed globally in ~/.claude/plugins. You can enable or disable them for this project below.
          </p>

          {filteredPlugins.length === 0 ? (
            <p className="text-gray-500">No plugins found</p>
          ) : (
            <div className="space-y-4">
              {filteredPlugins.map((plugin) => (
                <div
                  key={plugin.id}
                  className="border border-gray-200 dark:border-gray-700 rounded p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold">{plugin.name}</h4>
                        {plugin.version && (
                          <span className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">
                            v{plugin.version}
                          </span>
                        )}
                        {/* Only show marketplace badge when viewing "All" */}
                        {activeMarketplace === ALL_MARKETPLACES && plugin.marketplace && (
                          <span className="text-xs px-2 py-1 bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 rounded">
                            {plugin.marketplace}
                          </span>
                        )}
                        {plugin.hasMcpServers && (
                          <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded">
                            MCP
                          </span>
                        )}
                      </div>
                      {plugin.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {plugin.description}
                        </p>
                      )}
                      <div className="flex gap-4 mt-2 text-xs text-gray-500">
                        {plugin.skillCount > 0 && <span>Skills: {plugin.skillCount}</span>}
                        {plugin.commandCount > 0 && <span>Commands: {plugin.commandCount}</span>}
                        {plugin.agentCount > 0 && <span>Agents: {plugin.agentCount}</span>}
                        {plugin.hookCount > 0 && <span>Hooks: {plugin.hookCount}</span>}
                      </div>

                      {/* Expandable contents */}
                      <details
                        className="mt-3"
                        onToggle={(e) => {
                          if ((e.target as HTMLDetailsElement).open) {
                            loadPluginContents(plugin);
                            // Set default tab to first available entity type
                            if (!activeEntityTab[plugin.id]) {
                              if (plugin.skillCount > 0) {
                                setActiveEntityTab({ ...activeEntityTab, [plugin.id]: 'skills' });
                              } else if (plugin.commandCount > 0) {
                                setActiveEntityTab({ ...activeEntityTab, [plugin.id]: 'commands' });
                              } else if (plugin.agentCount > 0) {
                                setActiveEntityTab({ ...activeEntityTab, [plugin.id]: 'agents' });
                              }
                            }
                          }
                        }}
                      >
                        <summary className="cursor-pointer text-sm text-blue-600 dark:text-blue-400">
                          View contents
                        </summary>
                        <div className="mt-3">
                          {loadingContents[plugin.id] ? (
                            <p className="text-sm text-gray-500">Loading contents...</p>
                          ) : expandedPlugins[plugin.id] ? (
                            <div>
                              {/* Entity type tabs */}
                              <div className="border-b border-gray-200 dark:border-gray-600 mb-3">
                                <div className="flex gap-1">
                                  {expandedPlugins[plugin.id].skills.length > 0 && (
                                    <button
                                      className={`px-3 py-1.5 text-sm font-medium ${
                                        activeEntityTab[plugin.id] === 'skills'
                                          ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                                      }`}
                                      onClick={() => setActiveEntityTab({ ...activeEntityTab, [plugin.id]: 'skills' })}
                                    >
                                      Skills ({expandedPlugins[plugin.id].skills.length})
                                    </button>
                                  )}
                                  {expandedPlugins[plugin.id].commands.length > 0 && (
                                    <button
                                      className={`px-3 py-1.5 text-sm font-medium ${
                                        activeEntityTab[plugin.id] === 'commands'
                                          ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                                      }`}
                                      onClick={() => setActiveEntityTab({ ...activeEntityTab, [plugin.id]: 'commands' })}
                                    >
                                      Commands ({expandedPlugins[plugin.id].commands.length})
                                    </button>
                                  )}
                                  {expandedPlugins[plugin.id].agents.length > 0 && (
                                    <button
                                      className={`px-3 py-1.5 text-sm font-medium ${
                                        activeEntityTab[plugin.id] === 'agents'
                                          ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                                      }`}
                                      onClick={() => setActiveEntityTab({ ...activeEntityTab, [plugin.id]: 'agents' })}
                                    >
                                      Agents ({expandedPlugins[plugin.id].agents.length})
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Entity list */}
                              <div className="space-y-2">
                                {/* Skills list */}
                                {activeEntityTab[plugin.id] === 'skills' && expandedPlugins[plugin.id].skills.map((skill, idx) => (
                                  <button
                                    key={idx}
                                    className="w-full text-left p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    onClick={() => setSelectedSkill(skill)}
                                  >
                                    <div className="text-sm">
                                      <span className="font-medium text-blue-600 dark:text-blue-400">{skill.name}</span>
                                      {skill.description && (
                                        <p className="text-gray-600 dark:text-gray-400 mt-0.5">{skill.description}</p>
                                      )}
                                    </div>
                                  </button>
                                ))}

                                {/* Commands list */}
                                {activeEntityTab[plugin.id] === 'commands' && expandedPlugins[plugin.id].commands.map((command, idx) => (
                                  <button
                                    key={idx}
                                    className="w-full text-left p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    onClick={() => setSelectedCommand(command)}
                                  >
                                    <div className="text-sm">
                                      <span className="font-medium text-blue-600 dark:text-blue-400">/{command.name}</span>
                                      {command.description && (
                                        <p className="text-gray-600 dark:text-gray-400 mt-0.5">{command.description}</p>
                                      )}
                                    </div>
                                  </button>
                                ))}

                                {/* Agents list */}
                                {activeEntityTab[plugin.id] === 'agents' && expandedPlugins[plugin.id].agents.map((agent, idx) => (
                                  <button
                                    key={idx}
                                    className="w-full text-left p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    onClick={() => setSelectedAgent(agent)}
                                  >
                                    <div className="text-sm">
                                      <span className="font-medium text-blue-600 dark:text-blue-400">{agent.name}</span>
                                      {agent.description && (
                                        <p className="text-gray-600 dark:text-gray-400 mt-0.5">{agent.description}</p>
                                      )}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </details>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-sm">Enable</span>
                      <input
                        type="checkbox"
                        checked={plugin.enabled}
                        onChange={(e) => togglePlugin(plugin.id, e.target.checked)}
                        className="w-4 h-4"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
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
