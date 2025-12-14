/**
 * SessionLoader - Load and parse Claude session transcripts
 *
 * Claude stores session transcripts as JSONL files in:
 *   ~/.claude/projects/{project-folder-name}/{sessionId}.jsonl
 *
 * Subagent transcripts are stored alongside as:
 *   agent-{shortId}.jsonl
 *
 * This loader provides methods to:
 * - Discover projects and sessions
 * - Read transcripts in various formats (raw, parsed JSONL, blocks)
 */

import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type {
  CombinedClaudeTranscript,
  ParsedTranscript,
} from "@ai-systems/shared-types";
import {
  parseClaudeTranscriptFile,
  parseCombinedClaudeTranscript,
} from "@hhopkins/agent-converters/claude-sdk";
import {
  getProjectsDir,
  getProjectTranscriptDir,
  reverseProjectDirName,
} from "../utils/paths.js";

// ==================== TYPES ====================

/**
 * Lightweight session metadata (no transcript parsing required)
 */
export interface SessionMetadata {
  /** The session UUID */
  sessionId: string;
  /** Original project path this session belongs to */
  projectPath: string;
  /** Full path to the main transcript file */
  transcriptPath: string;
  /** When the session was created */
  createdAt: Date;
  /** When the session was last modified */
  modifiedAt: Date;
  /** Size of the main transcript in bytes */
  sizeBytes: number;
  /** Number of subagent transcript files */
  subagentCount: number;
  /** IDs of subagents (e.g., "agent-abc123") */
  subagentIds: string[];
}

/**
 * Project discovery result
 */
export interface ProjectInfo {
  /** The original absolute project path (e.g., /Users/hunter/project) */
  originalPath: string;
  /** The folder name in ~/.claude/projects (e.g., -Users-hunter-project) */
  folderName: string;
  /** Full path to the transcript directory */
  transcriptDir: string;
}

/**
 * Options for reading session transcripts
 */
export interface ReadSessionOptions {
  /** Whether to include subagent transcripts (default: true) */
  includeSubagents?: boolean;
}

/**
 * Parsed JSONL transcript with SDKMessage arrays
 */
export interface ParsedJsonlTranscript {
  /** Parsed messages from the main transcript */
  main: SDKMessage[];
  /** Parsed messages from subagent transcripts */
  subagents: { id: string; messages: SDKMessage[] }[];
}

// ==================== SESSION LOADER ====================

/**
 * Loader for Claude session transcripts
 */
export class SessionLoader {
  private claudeDir: string;

  constructor(claudeDir: string) {
    this.claudeDir = claudeDir;
  }

  // ==================== PRIVATE HELPERS ====================

  /**
   * Extract the parent sessionId from a subagent transcript file.
   *
   * Subagent files contain the parent sessionId in each message's sessionId field.
   * We read the first line to extract this efficiently.
   *
   * @param transcriptDir - Directory containing transcript files
   * @param subagentFile - Filename of the subagent file (e.g., "agent-abc123.jsonl")
   * @returns The parent session ID, or null if unable to determine
   */
  private async getSubagentSessionId(
    transcriptDir: string,
    subagentFile: string
  ): Promise<string | null> {
    try {
      const filePath = join(transcriptDir, subagentFile);
      const content = await readFile(filePath, "utf-8");
      const firstLine = content.split("\n")[0];
      if (firstLine) {
        const parsed = JSON.parse(firstLine);
        return parsed.sessionId || null;
      }
    } catch {
      // Ignore parsing errors - file may be corrupted or empty
    }
    return null;
  }

  /**
   * Build a map of sessionId → subagentIds for a project directory.
   * Scans all subagent files once for efficiency.
   *
   * @param transcriptDir - Directory containing transcript files
   * @returns Map from sessionId to array of subagent IDs
   */
  private async buildSubagentMap(
    transcriptDir: string
  ): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();

    const entries = await readdir(transcriptDir);
    const subagentFiles = entries.filter(
      (e) => e.startsWith("agent-") && e.endsWith(".jsonl")
    );

    for (const file of subagentFiles) {
      const sessionId = await this.getSubagentSessionId(transcriptDir, file);
      if (sessionId) {
        const id = file.replace(".jsonl", "");
        const existing = map.get(sessionId) || [];
        existing.push(id);
        map.set(sessionId, existing);
      }
    }

    return map;
  }

  // ==================== DISCOVERY ====================

  /**
   * List all projects that have session data
   */
  async listProjects(): Promise<ProjectInfo[]> {
    const projectsDir = getProjectsDir(this.claudeDir);

    try {
      const entries = await readdir(projectsDir, { withFileTypes: true });
      const projects: ProjectInfo[] = [];

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith("-")) {
          projects.push({
            folderName: entry.name,
            originalPath: reverseProjectDirName(entry.name),
            transcriptDir: join(projectsDir, entry.name),
          });
        }
      }

      return projects;
    } catch (error) {
      // Projects directory may not exist yet
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  /**
   * List all session IDs for a project
   *
   * @param projectPath - Absolute path to the project
   * @returns Array of session IDs (UUIDs)
   */
  async listSessions(projectPath: string): Promise<string[]> {
    const transcriptDir = getProjectTranscriptDir(this.claudeDir, projectPath);

    try {
      const entries = await readdir(transcriptDir);
      const sessions: string[] = [];

      for (const entry of entries) {
        // Session files are {uuid}.jsonl, not starting with "agent-"
        if (entry.endsWith(".jsonl") && !entry.startsWith("agent-")) {
          sessions.push(entry.replace(".jsonl", ""));
        }
      }

      return sessions;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  /**
   * List all sessions for a project with metadata.
   *
   * More efficient than calling getSessionMetadata for each session,
   * as it builds the subagent map once and reuses it.
   *
   * @param projectPath - Absolute path to the project
   * @returns Array of SessionMetadata for all sessions
   */
  async listSessionsWithMetadata(projectPath: string): Promise<SessionMetadata[]> {
    const transcriptDir = getProjectTranscriptDir(this.claudeDir, projectPath);

    try {
      // Build subagent map once for all sessions
      const subagentMap = await this.buildSubagentMap(transcriptDir);

      // List all session files
      const entries = await readdir(transcriptDir);
      const sessionFiles = entries.filter(
        (e) => e.endsWith(".jsonl") && !e.startsWith("agent-")
      );

      const sessions: SessionMetadata[] = [];
      for (const file of sessionFiles) {
        try {
          const sessionId = file.replace(".jsonl", "");
          const transcriptPath = join(transcriptDir, file);
          const stats = await stat(transcriptPath);
          const subagentIds = subagentMap.get(sessionId) || [];

          sessions.push({
            sessionId,
            projectPath,
            transcriptPath,
            createdAt: stats.birthtime,
            modifiedAt: stats.mtime,
            sizeBytes: stats.size,
            subagentCount: subagentIds.length,
            subagentIds,
          });
        } catch {
          // Skip sessions that fail to load (e.g., corrupted files)
        }
      }

      return sessions;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  /**
   * Get metadata for a specific session
   *
   * @param projectPath - Absolute path to the project
   * @param sessionId - The session UUID
   */
  async getSessionMetadata(
    projectPath: string,
    sessionId: string
  ): Promise<SessionMetadata> {
    const transcriptDir = getProjectTranscriptDir(this.claudeDir, projectPath);
    const transcriptPath = join(transcriptDir, `${sessionId}.jsonl`);

    // Get main transcript stats
    const stats = await stat(transcriptPath);

    // Find subagent files that belong to THIS session
    const entries = await readdir(transcriptDir);
    const allSubagentFiles = entries.filter(
      (e) => e.startsWith("agent-") && e.endsWith(".jsonl")
    );

    // Filter subagents by checking their parent sessionId
    const subagentIds: string[] = [];
    for (const file of allSubagentFiles) {
      const subagentSessionId = await this.getSubagentSessionId(
        transcriptDir,
        file
      );
      if (subagentSessionId === sessionId) {
        subagentIds.push(file.replace(".jsonl", ""));
      }
    }

    return {
      sessionId,
      projectPath,
      transcriptPath,
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime,
      sizeBytes: stats.size,
      subagentCount: subagentIds.length,
      subagentIds,
    };
  }

  // ==================== READING ====================

  /**
   * Read session transcript as raw JSONL strings
   *
   * Returns the raw file contents without parsing.
   * Use this when you need the original JSONL data.
   */
  async readRaw(
    projectPath: string,
    sessionId: string,
    options: ReadSessionOptions = {}
  ): Promise<CombinedClaudeTranscript> {
    const { includeSubagents = true } = options;
    const transcriptDir = getProjectTranscriptDir(this.claudeDir, projectPath);
    const transcriptPath = join(transcriptDir, `${sessionId}.jsonl`);

    // Read main transcript
    const main = await readFile(transcriptPath, "utf-8");

    // Read subagent transcripts if requested
    const subagents: { id: string; transcript: string }[] = [];

    if (includeSubagents) {
      const entries = await readdir(transcriptDir);
      const subagentFiles = entries.filter(
        (e) => e.startsWith("agent-") && e.endsWith(".jsonl")
      );

      for (const file of subagentFiles) {
        const id = file.replace(".jsonl", "");
        const transcript = await readFile(join(transcriptDir, file), "utf-8");

        // Check if this subagent belongs to this session
        const firstLine = transcript.split("\n")[0];
        if (firstLine) {
          try {
            const parsed = JSON.parse(firstLine);
            if (parsed.sessionId !== sessionId) {
              continue; // Skip subagents from other sessions
            }
          } catch {
            continue; // Skip files we can't parse
          }
        }

        // Filter out placeholder files (very short transcripts)
        const lineCount = transcript.trim().split("\n").length;
        if (lineCount > 1) {
          subagents.push({ id, transcript });
        }
      }
    }

    return { main, subagents };
  }

  /**
   * Read session transcript as parsed SDKMessage arrays
   *
   * Parses the JSONL into SDKMessage objects.
   * Use this when you need to work with the raw SDK message types.
   */
  async readParsedJsonl(
    projectPath: string,
    sessionId: string,
    options: ReadSessionOptions = {}
  ): Promise<ParsedJsonlTranscript> {
    const raw = await this.readRaw(projectPath, sessionId, options);

    return {
      main: parseClaudeTranscriptFile(raw.main),
      subagents: raw.subagents.map((s) => ({
        id: s.id,
        messages: parseClaudeTranscriptFile(s.transcript),
      })),
    };
  }

  /**
   * Read session transcript as CombinedClaudeTranscript
   *
   * Alias for readRaw - returns the same format.
   * Use this for consistency with the shared type name.
   */
  async readCombined(
    projectPath: string,
    sessionId: string,
    options: ReadSessionOptions = {}
  ): Promise<CombinedClaudeTranscript> {
    return this.readRaw(projectPath, sessionId, options);
  }

  /**
   * Read session transcript as ConversationBlocks
   *
   * Parses and converts to the architecture-agnostic block format.
   * Use this when you need the unified block representation.
   */
  async readBlocks(
    projectPath: string,
    sessionId: string,
    options: ReadSessionOptions = {}
  ): Promise<ParsedTranscript> {
    const raw = await this.readRaw(projectPath, sessionId, options);

    // Use the combined transcript parser which handles both main and subagents
    return parseCombinedClaudeTranscript(JSON.stringify(raw));
  }
}
