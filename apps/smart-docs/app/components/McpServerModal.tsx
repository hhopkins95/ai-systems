'use client';

import { useState, useEffect } from 'react';
import Modal from './Modal';
import type { McpServerWithSource } from '@/types';

interface McpServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  server?: McpServerWithSource | null;
}

interface FormData {
  name: string;
  command: string;
  args: string;
  env: { key: string; value: string }[];
}

export default function McpServerModal({ isOpen, onClose, onSave, server }: McpServerModalProps) {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    command: '',
    args: '',
    env: [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!server;

  // Initialize form when server changes
  useEffect(() => {
    if (server) {
      setFormData({
        name: server.name,
        command: server.command,
        args: server.args?.join(' ') || '',
        env: server.env
          ? Object.entries(server.env).map(([key, value]) => ({ key, value }))
          : [],
      });
    } else {
      setFormData({
        name: '',
        command: '',
        args: '',
        env: [],
      });
    }
    setError(null);
  }, [server, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      // Parse args (split by space, respecting quotes)
      const args = formData.args.trim()
        ? formData.args.match(/(?:[^\s"]+|"[^"]*")+/g)?.map(arg =>
            arg.startsWith('"') && arg.endsWith('"') ? arg.slice(1, -1) : arg
          ) || []
        : undefined;

      // Build env object
      const env = formData.env.length > 0
        ? formData.env.reduce((acc, { key, value }) => {
            if (key.trim()) {
              acc[key.trim()] = value;
            }
            return acc;
          }, {} as Record<string, string>)
        : undefined;

      const response = await fetch('/api/mcp/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          command: formData.command,
          args,
          env,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save MCP server');
      }

      onSave();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  const addEnvVar = () => {
    setFormData(prev => ({
      ...prev,
      env: [...prev.env, { key: '', value: '' }],
    }));
  };

  const removeEnvVar = (index: number) => {
    setFormData(prev => ({
      ...prev,
      env: prev.env.filter((_, i) => i !== index),
    }));
  };

  const updateEnvVar = (index: number, field: 'key' | 'value', value: string) => {
    setFormData(prev => ({
      ...prev,
      env: prev.env.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      ),
    }));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? `Edit MCP Server: ${server?.name}` : 'Add MCP Server'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 rounded">
            {error}
          </div>
        )}

        {/* Name */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Server Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., my-mcp-server"
            required
            disabled={isEditing}
          />
          {isEditing && (
            <p className="text-xs text-gray-500 mt-1">Name cannot be changed when editing</p>
          )}
        </div>

        {/* Command */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Command <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.command}
            onChange={(e) => setFormData(prev => ({ ...prev, command: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., npx, python, node"
            required
          />
        </div>

        {/* Args */}
        <div>
          <label className="block text-sm font-medium mb-1">Arguments</label>
          <input
            type="text"
            value={formData.args}
            onChange={(e) => setFormData(prev => ({ ...prev, args: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., -y @modelcontextprotocol/server-filesystem /path/to/dir"
          />
          <p className="text-xs text-gray-500 mt-1">Space-separated arguments. Use quotes for arguments with spaces.</p>
        </div>

        {/* Environment Variables */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium">Environment Variables</label>
            <button
              type="button"
              onClick={addEnvVar}
              className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              + Add Variable
            </button>
          </div>
          {formData.env.length > 0 ? (
            <div className="space-y-2">
              {formData.env.map((envVar, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={envVar.key}
                    onChange={(e) => updateEnvVar(index, 'key', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="KEY"
                  />
                  <span className="text-gray-400">=</span>
                  <input
                    type="text"
                    value={envVar.value}
                    onChange={(e) => updateEnvVar(index, 'value', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="value"
                  />
                  <button
                    type="button"
                    onClick={() => removeEnvVar(index)}
                    className="text-red-500 hover:text-red-700 p-2"
                  >
                    X
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No environment variables configured</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : isEditing ? 'Update' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
