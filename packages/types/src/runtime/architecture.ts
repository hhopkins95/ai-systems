/**
 * Agent Architecture Types
 *
 * Defines the supported agent execution architectures and their capabilities.
 * Used across server, execution, and client packages.
 */

/**
 * Supported agent architectures
 */
export type AgentArchitecture = 'claude-sdk' | 'opencode' 

/**
 * Transcript format used by the architecture
 */
export type TranscriptFormat = 'jsonl' | 'json';

/**
 * Architecture metadata and capabilities
 */
export interface ArchitectureInfo {
  /** Architecture identifier */
  id: AgentArchitecture;

  /** Human-readable display name */
  displayName: string;

  /** Format of transcript files */
  transcriptFormat: TranscriptFormat;

  /** Whether the architecture supports spawning subagents */
  supportsSubagents: boolean;

  /** Whether the architecture supports real-time streaming */
  supportsStreaming: boolean;
}

/**
 * Metadata for all supported architectures
 */
export const ARCHITECTURES: Record<AgentArchitecture, ArchitectureInfo> = {
  'claude-sdk': {
    id: 'claude-sdk',
    displayName: 'Claude SDK',
    transcriptFormat: 'jsonl',
    supportsSubagents: true,
    supportsStreaming: true,
  },
  'opencode': {
    id: 'opencode',
    displayName: 'OpenCode',
    transcriptFormat: 'json',
    supportsSubagents: true,
    supportsStreaming: true,
  }
};


type ClaudeSDKSessionOptions = {
  model?: string,
}

type OpenCodeSessionOptions = {
  model?: string,
}

export type AgentArchitectureSessionOptions = ClaudeSDKSessionOptions | OpenCodeSessionOptions;

/**
 * Get architecture info by ID
 */
export function getArchitectureInfo(architecture: AgentArchitecture): ArchitectureInfo {
  return ARCHITECTURES[architecture];
}

/**
 * Check if an architecture supports subagents
 */
export function supportsSubagents(architecture: AgentArchitecture): boolean {
  return ARCHITECTURES[architecture].supportsSubagents;
}

/**
 * Get the transcript format for an architecture
 */
export function getTranscriptFormat(architecture: AgentArchitecture): TranscriptFormat {
  return ARCHITECTURES[architecture].transcriptFormat;
}
