/**
 * Types for the test harness
 */

import type { StreamEvent } from '@ai-systems/shared-types';

export type RunnerCommand =
  | 'load-agent-profile'
  | 'load-session-transcript'
  | 'execute-query'
  | 'read-session-transcript';

export interface RunnerOptions {
  /** Runner command to execute */
  command: RunnerCommand;
  /** Input object to pipe to stdin as JSON */
  input: object;
  /** Working directory for the runner process */
  cwd?: string;
  /** Timeout in milliseconds (default: 300000) */
  timeout?: number;
  /** Callback for streaming events (execute-query only) */
  onEvent?: (event: StreamEvent) => void;
}

export interface RunnerResult {
  /** Process exit code */
  exitCode: number;
  /** Raw stdout content */
  stdout: string;
  /** Raw stderr content */
  stderr: string;
  /** Execution duration in milliseconds */
  duration: number;
}

export interface WorkspaceOptions {
  /** Use specific directory instead of temp */
  baseDir?: string;
  /** Don't clean up temp directory on exit */
  keep?: boolean;
  /** Clean the workspace before using */
  clean?: boolean;
}

export interface Workspace {
  /** Absolute path to workspace directory */
  path: string;
  /** Cleanup function to remove workspace */
  cleanup: () => Promise<void>;
}

export interface ParsedStream {
  /** All parsed events */
  events: StreamEvent[];
  /** Parsing errors for malformed lines */
  errors: Error[];
  /** Summary statistics */
  summary: StreamSummary;
}

export interface StreamSummary {
  /** Total number of events */
  totalEvents: number;
  /** Event counts by type */
  byType: Record<string, number>;
  /** Extracted text content from text blocks */
  textContent: string[];
  /** Tool names that were called */
  toolCalls: string[];
  /** Whether any error events occurred */
  hasError: boolean;
}

export type OutputFormat = 'stream' | 'collect' | 'summary';
