'use client';

import { useState, useEffect, useMemo } from 'react';
import { Prism as SyntaxHighlighterBase } from 'react-syntax-highlighter';
// Cast to any to avoid React 19 JSX type incompatibility
const SyntaxHighlighter = SyntaxHighlighterBase as any;
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { Plugin, ClaudeConfig, Skill, Command, Agent, MarketplacePlugin } from '@/types';
import SkillModal from './SkillModal';
import CommandModal from './CommandModal';
import AgentModal from './AgentModal';
import ConfirmDialog from './ConfirmDialog';
import { ToastContainer, useToast } from './Toast';

type EntityType = 'skills' | 'commands' | 'agents';

const ALL_MARKETPLACES = '__all__';
const STANDALONE = '__standalone__';

interface AvailablePluginsData {
  marketplace: string;
  available: MarketplacePlugin[];
  totalInMarketplace: number;
  installedCount: number;
}

export default function PluginsTab() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPlugins, setExpandedPlugins] = useState<Record<string, ClaudeConfig>>({});
  const [loadingContents, setLoadingContents] = useState<Record<string, boolean>>({});
  const [activeEntityTab, setActiveEntityTab] = useState<Record<string, EntityType>>({});
  const [activeMarketplace, setActiveMarketplace] = useState<string>(ALL_MARKETPLACES);

  // Available plugins state
  const [availablePlugins, setAvailablePlugins] = useState<Record<string, AvailablePluginsData>>({});
  const [loadingAvailable, setLoadingAvailable] = useState<Record<string, boolean>>({});
  const [expandedAvailable, setExpandedAvailable] = useState<Record<string, boolean>>({});

  // Modal state
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [selectedCommand, setSelectedCommand] = useState<Command | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  // Marketplace management state
  const [showAddMarketplace, setShowAddMarketplace] = useState(false);
  const [newMarketplaceSource, setNewMarketplaceSource] = useState('');
  const [addingMarketplace, setAddingMarketplace] = useState(false);

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDestructive?: boolean;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  // Toast notifications
  const { toasts, dismissToast, success, error } = useToast();

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
    } catch (err) {
      console.error('Failed to fetch plugins:', err);
      error('Failed to fetch plugins');
    } finally {
      setLoading(false);
    }
  };

  const togglePlugin = async (pluginId: string, enabled: boolean) => {
    try {
      const response = await fetch('/api/plugins/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pluginId, enabled }),
      });

      if (response.ok) {
        setPlugins(plugins.map(p =>
          p.id === pluginId ? { ...p, enabled } : p
        ));
        success(`Plugin ${enabled ? 'enabled' : 'disabled'}`);
      }
    } catch (err) {
      console.error('Failed to toggle plugin:', err);
      error('Failed to toggle plugin');
    }
  };

  const loadPluginContents = async (plugin: Plugin) => {
    if (expandedPlugins[plugin.id]) return;

    setLoadingContents({ ...loadingContents, [plugin.id]: true });

    try {
      const response = await fetch('/api/plugins/contents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pluginPath: plugin.path,
          pluginId: plugin.id,
          marketplace: plugin.marketplace,
          includeContents: true,
        }),
      });

      const config = await response.json();
      setExpandedPlugins({ ...expandedPlugins, [plugin.id]: config });
    } catch (err) {
      console.error('Failed to fetch plugin contents:', err);
    } finally {
      setLoadingContents({ ...loadingContents, [plugin.id]: false });
    }
  };

  // Marketplace management functions
  const handleAddMarketplace = async () => {
    if (!newMarketplaceSource) return;

    setAddingMarketplace(true);
    try {
      const response = await fetch('/api/marketplaces/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: newMarketplaceSource }),
      });

      const data = await response.json();
      if (response.ok) {
        success('Marketplace added successfully');
        setShowAddMarketplace(false);
        setNewMarketplaceSource('');
        fetchPlugins(); // Refresh to show new marketplace plugins
      } else {
        error(data.error || 'Failed to add marketplace');
      }
    } catch (err) {
      console.error('Failed to add marketplace:', err);
      error('Failed to add marketplace');
    } finally {
      setAddingMarketplace(false);
    }
  };

  const handleUpdateMarketplace = (marketplace: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Update Marketplace',
      message: `Update "${marketplace}" to fetch the latest plugins?`,
      onConfirm: async () => {
        setConfirmDialog({ ...confirmDialog, isOpen: false });
        try {
          const response = await fetch('/api/marketplaces/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: marketplace }),
          });

          const data = await response.json();
          if (response.ok) {
            success(`Marketplace "${marketplace}" updated`);
            fetchPlugins();
            // Clear available plugins cache for this marketplace
            setAvailablePlugins(prev => {
              const updated = { ...prev };
              delete updated[marketplace];
              return updated;
            });
          } else {
            error(data.error || 'Failed to update marketplace');
          }
        } catch (err) {
          console.error('Failed to update marketplace:', err);
          error('Failed to update marketplace');
        }
      },
    });
  };

  const handleRemoveMarketplace = (marketplace: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Remove Marketplace',
      message: `Remove "${marketplace}"? This will not uninstall plugins from this marketplace.`,
      isDestructive: true,
      onConfirm: async () => {
        setConfirmDialog({ ...confirmDialog, isOpen: false });
        try {
          const response = await fetch('/api/marketplaces/remove', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: marketplace }),
          });

          const data = await response.json();
          if (response.ok) {
            success(`Marketplace "${marketplace}" removed`);
            if (activeMarketplace === marketplace) {
              setActiveMarketplace(ALL_MARKETPLACES);
            }
            fetchPlugins();
          } else {
            error(data.error || 'Failed to remove marketplace');
          }
        } catch (err) {
          console.error('Failed to remove marketplace:', err);
          error('Failed to remove marketplace');
        }
      },
    });
  };

  // Plugin installation functions
  const loadAvailablePlugins = async (marketplace: string) => {
    if (availablePlugins[marketplace] || loadingAvailable[marketplace]) return;

    setLoadingAvailable({ ...loadingAvailable, [marketplace]: true });
    try {
      const response = await fetch(`/api/plugins/available?marketplace=${encodeURIComponent(marketplace)}`);
      const data = await response.json();
      if (response.ok) {
        setAvailablePlugins({ ...availablePlugins, [marketplace]: data });
      }
    } catch (err) {
      console.error('Failed to load available plugins:', err);
    } finally {
      setLoadingAvailable({ ...loadingAvailable, [marketplace]: false });
    }
  };

  const handleInstallPlugin = (pluginName: string, marketplace: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Install Plugin',
      message: `Install "${pluginName}" from ${marketplace}?`,
      onConfirm: async () => {
        setConfirmDialog({ ...confirmDialog, isOpen: false });
        try {
          const response = await fetch('/api/plugins/install', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: `${pluginName}@${marketplace}` }),
          });

          const data = await response.json();
          if (response.ok) {
            success(`Plugin "${pluginName}" installed`);
            fetchPlugins();
            // Update available plugins
            setAvailablePlugins(prev => {
              const updated = { ...prev };
              if (updated[marketplace]) {
                updated[marketplace] = {
                  ...updated[marketplace],
                  available: updated[marketplace].available.filter(p => p.name !== pluginName),
                  installedCount: updated[marketplace].installedCount + 1,
                };
              }
              return updated;
            });
          } else {
            error(data.error || 'Failed to install plugin');
          }
        } catch (err) {
          console.error('Failed to install plugin:', err);
          error('Failed to install plugin');
        }
      },
    });
  };

  const handleUninstallPlugin = (plugin: Plugin) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Uninstall Plugin',
      message: `Uninstall "${plugin.name}"? This will remove the plugin files.`,
      isDestructive: true,
      onConfirm: async () => {
        setConfirmDialog({ ...confirmDialog, isOpen: false });
        try {
          const response = await fetch('/api/plugins/uninstall', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pluginId: plugin.id }),
          });

          const data = await response.json();
          if (response.ok) {
            success(`Plugin "${plugin.name}" uninstalled`);
            fetchPlugins();
            // Clear available plugins cache if from marketplace
            if (plugin.marketplace) {
              setAvailablePlugins(prev => {
                const updated = { ...prev };
                delete updated[plugin.marketplace!];
                return updated;
              });
            }
          } else {
            error(data.error || 'Failed to uninstall plugin');
          }
        } catch (err) {
          console.error('Failed to uninstall plugin:', err);
          error('Failed to uninstall plugin');
        }
      },
    });
  };

  if (loading) {
    return <div className="p-4">Loading...</div>;
  }

  const getMarketplaceLabel = (marketplace: string) => {
    if (marketplace === ALL_MARKETPLACES) return 'All';
    if (marketplace === STANDALONE) return 'Standalone';
    return marketplace;
  };

  const isRealMarketplace = (marketplace: string) => {
    return marketplace !== ALL_MARKETPLACES && marketplace !== STANDALONE;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Marketplace tabs with actions */}
      <div className="border-b border-gray-200 dark:border-gray-700 px-6 pt-4">
        <div className="flex items-center gap-2 overflow-x-auto">
          {/* All tab */}
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

          {/* Marketplace tabs */}
          {marketplaces.map((marketplace) => (
            <div key={marketplace} className="relative group flex items-center">
              <button
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                  activeMarketplace === marketplace
                    ? 'bg-white dark:bg-gray-800 border border-b-0 border-gray-200 dark:border-gray-700 text-blue-600 dark:text-blue-400'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                onClick={() => setActiveMarketplace(marketplace)}
              >
                {getMarketplaceLabel(marketplace)} ({pluginsByMarketplace[marketplace]?.length || 0})
              </button>

              {/* Marketplace actions (only for real marketplaces) */}
              {isRealMarketplace(marketplace) && activeMarketplace === marketplace && (
                <div className="flex items-center gap-1 ml-1">
                  <button
                    onClick={() => handleUpdateMarketplace(marketplace)}
                    className="p-1 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400"
                    title="Update marketplace"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleRemoveMarketplace(marketplace)}
                    className="p-1 text-gray-500 hover:text-red-600 dark:hover:text-red-400"
                    title="Remove marketplace"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Add marketplace button */}
          <button
            onClick={() => setShowAddMarketplace(true)}
            className="px-3 py-2 text-sm font-medium text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors whitespace-nowrap"
          >
            + Add Marketplace
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-8">
          {/* Available plugins section (for real marketplaces) */}
          {isRealMarketplace(activeMarketplace) && (
            <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4">
              <details
                open={expandedAvailable[activeMarketplace]}
                onToggle={(e) => {
                  const isOpen = (e.target as HTMLDetailsElement).open;
                  setExpandedAvailable({ ...expandedAvailable, [activeMarketplace]: isOpen });
                  if (isOpen) {
                    loadAvailablePlugins(activeMarketplace);
                  }
                }}
              >
                <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300">
                  Available plugins to install
                  {availablePlugins[activeMarketplace] && (
                    <span className="ml-2 text-gray-500">
                      ({availablePlugins[activeMarketplace].available.length} available)
                    </span>
                  )}
                </summary>

                <div className="mt-4">
                  {loadingAvailable[activeMarketplace] ? (
                    <p className="text-sm text-gray-500">Loading available plugins...</p>
                  ) : availablePlugins[activeMarketplace]?.available.length === 0 ? (
                    <p className="text-sm text-gray-500">All plugins from this marketplace are installed</p>
                  ) : availablePlugins[activeMarketplace]?.available.map((plugin) => (
                    <div
                      key={plugin.name}
                      className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded mb-2"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{plugin.name}</span>
                          {plugin.version && (
                            <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">
                              v{plugin.version}
                            </span>
                          )}
                        </div>
                        {plugin.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{plugin.description}</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleInstallPlugin(plugin.name, activeMarketplace)}
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                      >
                        Install
                      </button>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

          {/* Installed plugins list */}
          <div>
            <h3 className="text-lg font-semibold mb-2">Installed Plugins</h3>
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

                      <div className="flex items-center gap-3">
                        {/* Uninstall button */}
                        <button
                          onClick={() => handleUninstallPlugin(plugin)}
                          className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                          title="Uninstall plugin"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>

                        {/* Enable/disable toggle */}
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
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Marketplace Modal */}
      {showAddMarketplace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowAddMarketplace(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-lg font-semibold mb-4">Add Marketplace</h2>

            <div>
              <label className="block text-sm font-medium mb-1">Source</label>
              <input
                type="text"
                value={newMarketplaceSource}
                onChange={(e) => setNewMarketplaceSource(e.target.value)}
                placeholder="owner/repo or git URL"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
              />
              <p className="text-xs text-gray-500 mt-1">e.g., anthropics/claude-code-plugins</p>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowAddMarketplace(false)}
                className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddMarketplace}
                disabled={!newMarketplaceSource || addingMarketplace}
                className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {addingMarketplace ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        isDestructive={confirmDialog.isDestructive}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
      />

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
