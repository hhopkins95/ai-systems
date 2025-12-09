/**
 * Claude Code settings.json schema types
 */

import type { HookEvent, HookMatcher } from "../entities/hook.js";

/**
 * Permission rules for tool access
 */
export interface ClaudePermissions {
  /** Tool patterns to allow */
  allow?: string[];
  /** Tool patterns to deny */
  deny?: string[];
  /** Tool patterns to ask for confirmation */
  ask?: string[];
  /** Additional directories Claude can access */
  additionalDirectories?: string[];
  /** Default permission mode */
  defaultMode?: string;
}

/**
 * MCP server reference for allowlist
 */
export interface McpServerRef {
  serverName: string;
}

/**
 * Claude Code settings.json configuration
 */
export interface ClaudeSettings {
  /** Permission rules for tool access */
  permissions?: ClaudePermissions;
  /** Hook configurations by event type */
  hooks?: Partial<Record<HookEvent, HookMatcher[]>>;
  /** Output style for system prompt adjustments */
  outputStyle?: string;
  /** Allowlist of MCP servers users can configure */
  allowedMcpServers?: McpServerRef[];
  /** Enabled/disabled plugins by "plugin@marketplace" key */
  enabledPlugins?: Record<string, boolean>;
}
