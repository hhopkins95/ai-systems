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

type ServerType = 'stdio' | 'http';

interface FormData {
  name: string;
  type: ServerType;
  // Stdio fields
  command: string;
  args: string;
  env: { key: string; value: string }[];
  // HTTP fields
  url: string;
  headers: { key: string; value: string }[];
}

export default function McpServerModal({ isOpen, onClose, onSave, server }: McpServerModalProps) {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    type: 'stdio',
    command: '',
    args: '',
    env: [],
    url: '',
    headers: [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!server;

  // Initialize form when server changes
  useEffect(() => {
    if (server) {
      // Determine type from server data
      const serverType: ServerType = server.type === 'http' || (!server.command && server.url) ? 'http' : 'stdio';

      setFormData({
        name: server.name,
        type: serverType,
        command: server.command || '',
        args: server.args?.join(' ') || '',
        env: server.env
          ? Object.entries(server.env).map(([key, value]) => ({ key, value }))
          : [],
        url: server.url || '',
        headers: server.headers
          ? Object.entries(server.headers).map(([key, value]) => ({ key, value }))
          : [],
      });
    } else {
      setFormData({
        name: '',
        type: 'stdio',
        command: '',
        args: '',
        env: [],
        url: '',
        headers: [],
      });
    }
    setError(null);
  }, [server, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const isHttp = formData.type === 'http';

      // Build request body based on type
      const body: Record<string, unknown> = {
        name: formData.name,
        type: formData.type,
      };

      if (isHttp) {
        body.url = formData.url;
        // Build headers object
        if (formData.headers.length > 0) {
          const headers = formData.headers.reduce((acc, { key, value }) => {
            if (key.trim()) {
              acc[key.trim()] = value;
            }
            return acc;
          }, {} as Record<string, string>);
          if (Object.keys(headers).length > 0) {
            body.headers = headers;
          }
        }
      } else {
        body.command = formData.command;
        // Parse args (split by space, respecting quotes)
        if (formData.args.trim()) {
          const args = formData.args.match(/(?:[^\s"]+|"[^"]*")+/g)?.map(arg =>
            arg.startsWith('"') && arg.endsWith('"') ? arg.slice(1, -1) : arg
          );
          if (args && args.length > 0) {
            body.args = args;
          }
        }
        // Build env object
        if (formData.env.length > 0) {
          const env = formData.env.reduce((acc, { key, value }) => {
            if (key.trim()) {
              acc[key.trim()] = value;
            }
            return acc;
          }, {} as Record<string, string>);
          if (Object.keys(env).length > 0) {
            body.env = env;
          }
        }
      }

      const response = await fetch('/api/mcp/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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

  // Key-value pair helpers for env and headers
  const addKeyValue = (field: 'env' | 'headers') => {
    setFormData(prev => ({
      ...prev,
      [field]: [...prev[field], { key: '', value: '' }],
    }));
  };

  const removeKeyValue = (field: 'env' | 'headers', index: number) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index),
    }));
  };

  const updateKeyValue = (field: 'env' | 'headers', index: number, keyOrValue: 'key' | 'value', value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].map((item, i) =>
        i === index ? { ...item, [keyOrValue]: value } : item
      ),
    }));
  };

  const renderKeyValueSection = (
    field: 'env' | 'headers',
    label: string,
    keyPlaceholder: string = 'KEY',
    valuePlaceholder: string = 'value'
  ) => (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium">{label}</label>
        <button
          type="button"
          onClick={() => addKeyValue(field)}
          className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
        >
          + Add
        </button>
      </div>
      {formData[field].length > 0 ? (
        <div className="space-y-2">
          {formData[field].map((item, index) => (
            <div key={index} className="flex gap-2 items-center">
              <input
                type="text"
                value={item.key}
                onChange={(e) => updateKeyValue(field, index, 'key', e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={keyPlaceholder}
              />
              <span className="text-gray-400">=</span>
              <input
                type="text"
                value={item.value}
                onChange={(e) => updateKeyValue(field, index, 'value', e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={valuePlaceholder}
              />
              <button
                type="button"
                onClick={() => removeKeyValue(field, index)}
                className="text-red-500 hover:text-red-700 p-2"
              >
                X
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">No {label.toLowerCase()} configured</p>
      )}
    </div>
  );

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

        {/* Server Type */}
        <div>
          <label className="block text-sm font-medium mb-1">Server Type</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="serverType"
                value="stdio"
                checked={formData.type === 'stdio'}
                onChange={() => setFormData(prev => ({ ...prev, type: 'stdio' }))}
                className="text-blue-600"
              />
              <span>Stdio (Local)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="serverType"
                value="http"
                checked={formData.type === 'http'}
                onChange={() => setFormData(prev => ({ ...prev, type: 'http' }))}
                className="text-blue-600"
              />
              <span>HTTP (Remote)</span>
            </label>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {formData.type === 'stdio'
              ? 'Stdio servers run locally via command execution'
              : 'HTTP servers connect to a remote MCP endpoint'}
          </p>
        </div>

        {/* Stdio Fields */}
        {formData.type === 'stdio' && (
          <>
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
                required={formData.type === 'stdio'}
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
            {renderKeyValueSection('env', 'Environment Variables', 'KEY', 'value')}
          </>
        )}

        {/* HTTP Fields */}
        {formData.type === 'http' && (
          <>
            {/* URL */}
            <div>
              <label className="block text-sm font-medium mb-1">
                URL <span className="text-red-500">*</span>
              </label>
              <input
                type="url"
                value={formData.url}
                onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://example.com/mcp"
                required={formData.type === 'http'}
              />
            </div>

            {/* Headers */}
            {renderKeyValueSection('headers', 'Headers', 'Header-Name', 'Header value')}
          </>
        )}

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
