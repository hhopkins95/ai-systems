'use client';

import { useState, useEffect } from 'react';
import { Prism as SyntaxHighlighterBase } from 'react-syntax-highlighter';
// Cast to any to avoid React 19 JSX type incompatibility
const SyntaxHighlighter = SyntaxHighlighterBase as any;
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { AgentContext, SkillWithSource, CommandWithSource, AgentWithSource, EntitySource } from '@/types';
import SourceBadge from './SourceBadge';
import SkillModal from './SkillModal';
import CommandModal from './CommandModal';
import AgentModal from './AgentModal';

type DocumentType = 'skills' | 'commands' | 'agents' | 'hooks';
type SourceType = 'global' | 'project' | 'plugin';

export default function ClaudeConfigTab() {
  const [config, setConfig] = useState<AgentContext | null>(null);
  const [activeTab, setActiveTab] = useState<DocumentType>('skills');
  const [loading, setLoading] = useState(true);

  // Modal state
  const [selectedSkill, setSelectedSkill] = useState<SkillWithSource | null>(null);
  const [selectedCommand, setSelectedCommand] = useState<CommandWithSource | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentWithSource | null>(null);

  useEffect(() => {
    fetchConfig();
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

  // Group items by their source type (now accessed via source.type)
  const groupBySource = <T extends { source?: EntitySource }>(items: T[]) => {
    const grouped: {
      global: T[];
      project: T[];
      plugin: T[];
    } = {
      global: [],
      project: [],
      plugin: [],
    };

    items.forEach(item => {
      const sourceType: SourceType = item.source?.type ?? 'project';
      grouped[sourceType].push(item);
    });

    return grouped;
  };

  const renderSkills = () => {
    if (!config) return null;

    const grouped = groupBySource(config.skills);
    const sources: Array<SourceType> = ['global', 'project', 'plugin'];

    return (
      <div className="space-y-6">
        {sources.map(source => {
          const skills = grouped[source];
          if (skills.length === 0) return null;

          return (
            <div key={source}>
              <h3 className="text-lg font-semibold mb-3 capitalize">{source} Skills ({skills.length})</h3>
              <div className="space-y-4">
                {skills.map((skill, idx) => (
                  <button
                    key={idx}
                    className="w-full border border-gray-200 dark:border-gray-700 rounded p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                    onClick={() => setSelectedSkill(skill)}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold">{skill.name}</h4>
                      <SourceBadge source={skill.source} />
                    </div>
                    {skill.metadata?.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {skill.metadata.description}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-2">
                      {skill.files.length} file(s)
                    </p>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderCommands = () => {
    if (!config) return null;

    const grouped = groupBySource(config.commands);
    const sources: Array<SourceType> = ['global', 'project', 'plugin'];

    return (
      <div className="space-y-6">
        {sources.map(source => {
          const commands = grouped[source];
          if (commands.length === 0) return null;

          return (
            <div key={source}>
              <h3 className="text-lg font-semibold mb-3 capitalize">{source} Commands ({commands.length})</h3>
              <div className="space-y-4">
                {commands.map((command, idx) => (
                  <button
                    key={idx}
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
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderAgents = () => {
    if (!config) return null;

    const grouped = groupBySource(config.subagents);
    const sources: Array<SourceType> = ['global', 'project', 'plugin'];

    return (
      <div className="space-y-6">
        {sources.map(source => {
          const agents = grouped[source];
          if (agents.length === 0) return null;

          return (
            <div key={source}>
              <h3 className="text-lg font-semibold mb-3 capitalize">{source} Agents ({agents.length})</h3>
              <div className="space-y-4">
                {agents.map((agent, idx) => (
                  <button
                    key={idx}
                    className="w-full border border-gray-200 dark:border-gray-700 rounded p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                    onClick={() => setSelectedAgent(agent)}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold">{agent.name}</h4>
                      <SourceBadge source={agent.source} />
                    </div>
                    {agent.metadata?.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {agent.metadata.description}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderHooks = () => {
    if (!config) return null;

    const grouped = groupBySource(config.hooks);
    const sources: Array<SourceType> = ['global', 'project', 'plugin'];

    return (
      <div className="space-y-6">
        {sources.map(source => {
          const hooks = grouped[source];
          if (hooks.length === 0) return null;

          return (
            <div key={source}>
              <h3 className="text-lg font-semibold mb-3 capitalize">{source} Hooks ({hooks.length})</h3>
              <div className="space-y-4">
                {hooks.map((hook, idx) => (
                  <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded p-4">
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
                ))}
              </div>
            </div>
          );
        })}
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
    }
  };

  const tabs: Array<{ id: DocumentType; label: string }> = [
    { id: 'skills', label: 'Skills' },
    { id: 'commands', label: 'Commands' },
    { id: 'agents', label: 'Agents' },
    { id: 'hooks', label: 'Hooks' },
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
              {config && (
                <span className="ml-2 text-xs">
                  ({tab.id === 'agents' ? config.subagents.length : config[tab.id as Exclude<DocumentType, 'agents'>].length})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {config && renderContent()}
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
