/**
 * Claude Code settings.json schema types
 */

import { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import type { HookEvent, HookMatcher } from "../../agents/entities/hook";

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
  allowedMcpServers?: {serverName : string}[];
  /** Enabled/disabled plugins by "plugin@marketplace" key */
  enabledPlugins?: Record<string, boolean>;
}


/**
 * Schema for the .mcp.json file
 */
export type ClaudeMcpJsonConfig ={mcpServers : Record<string, McpServerConfig>}