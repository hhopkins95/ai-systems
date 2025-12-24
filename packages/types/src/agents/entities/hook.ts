/**
 * Hook entity types
 */

import type { EntitySource } from "../sources.js";

/**
 * Available hook events
 */
export type HookEvent =
  | "PreToolUse"
  | "PostToolUse"
  | "Stop"
  | "SubagentStop"
  | "SessionStart"
  | "SessionEnd"
  | "UserPromptSubmit"
  | "PreCompact"
  | "Notification";

/**
 * Hook configuration for a command-based hook
 */
export interface CommandHookConfig {
  type: "command";
  /** Shell command to execute */
  command: string;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Run asynchronously */
  async?: boolean;
}

/**
 * Hook configuration for a prompt-based hook
 */
export interface PromptHookConfig {
  type: "prompt";
  /** Prompt to send to the model */
  prompt: string;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Run asynchronously */
  async?: boolean;
}

/**
 * Union of hook config types
 */
export type HookConfig = CommandHookConfig | PromptHookConfig;

/**
 * A hook matcher that defines when a hook should trigger
 */
export interface HookMatcher {
  /** Tool name pattern to match (for tool-related events) */
  matcher?: string;
  /** The hook configuration */
  hooks: HookConfig[];
}

/**
 * A hook entity loaded from a .json file
 */
export interface Hook {
  /** Hook name (derived from filename) */
  name: string;
  /** Map of event types to their matchers */
  hooks: Partial<Record<HookEvent, HookMatcher[]>>;
}

export type HookWithSource = Hook & {source?: EntitySource};