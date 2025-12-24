/**
 * Permission level for tool access
 */
export type OpencodePermissionLevel = "allow" | "ask" | "deny";

/**
 * Tool permissions by tool name
 */
export type OpencodePermissions = Record<string, OpencodePermissionLevel>;

/**
 * Tool enable/disable flags
 */
export type OpencodeTools = Record<string, boolean>;


export type OpencodeMcpServerConfig = {
  type: "local",
  command: string[];
  enabled?: boolean
  environment?: Record<string, string>;
} | {
  type: "remote",
  url: string;
  headers?: Record<string, string>;
  enabled?: boolean;
}

/**
 * Inline agent definition
 */
export interface OpencodeAgent {
  /** Description of what the agent does */
  description?: string;
  /** Model to use for this agent */
  model?: string;
  /** System prompt for the agent */
  prompt?: string;
  /** Tool overrides for this agent */
  tools?: OpencodeTools;
}

/**
 * Inline command definition
 */
export interface OpencodeCommand {
  /** Command template (can include $ARGUMENTS) */
  template: string;
  /** Description of the command */
  description?: string;
  /** Agent to use for this command */
  agent?: string;
  /** Model override for this command */
  model?: string;
}

/**
 * Provider configuration options
 */
export interface OpencodeProviderOptions {
  /** API key for the provider */
  apiKey?: string;
  /** Base URL override */
  baseUrl?: string;
}

/**
 * Provider configuration
 */
export interface OpencodeProvider {
  /** Model configurations */
  models?: Record<string, unknown>;
  /** Provider options */
  options?: OpencodeProviderOptions;
}

/**
 * OpenCode opencode.json configuration
 */
export interface OpencodeSettings {
  /** Plugin paths */
  plugin?: string[];
  /** Tool permissions */
  permission?: OpencodePermissions;
  /** Tool enable/disable flags */
  tools?: OpencodeTools;
  /** MCP server configurations */
  mcp?: Record<string, OpencodeMcpServerConfig>;
  /** Inline agent definitions */
  agent?: Record<string, OpencodeAgent>;
  /** Inline command definitions */
  command?: Record<string, OpencodeCommand>;
  /** Paths/globs to instruction files */
  instructions?: string[];
  /** Provider configurations */
  provider?: Record<string, OpencodeProvider>;
  /** Default model (format: "provider/model-name") */
  model?: string;
  /** Model for lightweight tasks */
  small_model?: string;
  /** Providers to disable */
  disabled_providers?: string[];
}
