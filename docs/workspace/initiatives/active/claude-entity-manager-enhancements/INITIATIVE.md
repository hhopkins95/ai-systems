---
title: Claude Entity Manager Enhancements
created: 2025-12-13
status: active
---

# Claude Entity Manager Enhancements

## Goal

Enhance the `@hhopkins/claude-entity-manager` package with:
1. Configurable Claude config directory path (with `CLAUDE_CONFIG_DIR` env support)
2. Session transcript reading capabilities using existing converters

## Scope

**In scope:**
- Update `getClaudeDir()` to check `CLAUDE_CONFIG_DIR` env variable
- Create `SessionLoader` class for discovering and reading session transcripts
- Add path utilities for project directory naming conventions
- Integrate with `@hhopkins/agent-converters` for transcript parsing
- Add convenience methods to `ClaudeEntityManager`

**Out of scope:**
- OpenCode transcript support (future enhancement)
- Session writing/creation
- Transcript modification or deletion

## Completion Criteria

- [ ] `getClaudeDir()` respects `CLAUDE_CONFIG_DIR` env variable
- [ ] `SessionLoader` can list projects and sessions
- [ ] `SessionLoader` can read transcripts in all formats (raw, jsonl, combined, blocks)
- [ ] Path utilities for project folder naming exist
- [ ] Integration with existing converters package
- [ ] Exported standalone and integrated with manager
- [ ] Documentation updated

## Current Status

Design complete, ready to implement.

## Design

### 1. Config Dir Enhancement

Update `packages/claude-entity-manager/src/utils/paths.ts`:

```typescript
export function getClaudeDir(customDir?: string): string {
  return customDir || process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
}
```

### 2. New Path Utilities

```typescript
// Get the projects directory
export function getProjectsDir(claudeDir: string): string {
  return join(claudeDir, "projects");
}

// Convert absolute project path to Claude's folder name format
// /Users/hunter/my-project → -Users-hunter-my-project
export function getProjectDirName(projectPath: string): string {
  return projectPath.replace(/\//g, '-').replace(/\./g, '-');
}

// Get the transcript directory for a specific project
export function getProjectTranscriptDir(claudeDir: string, projectPath: string): string {
  return join(getProjectsDir(claudeDir), getProjectDirName(projectPath));
}
```

### 3. SessionLoader Types

```typescript
// Session metadata (lightweight, no transcript parsing)
export interface SessionMetadata {
  sessionId: string;
  projectPath: string;
  transcriptPath: string;
  createdAt: Date;
  modifiedAt: Date;
  sizeBytes: number;
  subagentCount: number;
  subagentIds: string[];
}

// Project info for discovery
export interface ProjectInfo {
  originalPath: string;   // /Users/hunter/project
  folderName: string;     // -Users-hunter-project
  transcriptDir: string;  // full path to transcript directory
}

// Read options
export interface ReadSessionOptions {
  includeSubagents?: boolean;  // default: true
}

// Parsed JSONL format (SDKMessage arrays)
export interface ParsedJsonlTranscript {
  main: SDKMessage[];
  subagents: { id: string; messages: SDKMessage[] }[];
}
```

### 4. SessionLoader Class

```typescript
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { CombinedClaudeTranscript, ParsedTranscript } from '@ai-systems/shared-types';
import { parseClaudeTranscriptFile, parseCombinedClaudeTranscript } from '@hhopkins/agent-converters';

export class SessionLoader {
  private claudeDir: string;

  constructor(claudeDir: string);

  // Discovery
  async listProjects(): Promise<ProjectInfo[]>;
  async listSessions(projectPath: string): Promise<string[]>;
  async getSessionMetadata(projectPath: string, sessionId: string): Promise<SessionMetadata>;

  // Reading - separate methods for type safety
  async readRaw(
    projectPath: string,
    sessionId: string,
    options?: ReadSessionOptions
  ): Promise<CombinedClaudeTranscript>;

  async readParsedJsonl(
    projectPath: string,
    sessionId: string,
    options?: ReadSessionOptions
  ): Promise<ParsedJsonlTranscript>;

  async readCombined(
    projectPath: string,
    sessionId: string,
    options?: ReadSessionOptions
  ): Promise<CombinedClaudeTranscript>;  // Alias for readRaw

  async readBlocks(
    projectPath: string,
    sessionId: string,
    options?: ReadSessionOptions
  ): Promise<ParsedTranscript>;
}
```

### 5. Integration with ClaudeEntityManager

```typescript
// In ClaudeEntityManager class
private sessionLoader: SessionLoader;

// In constructor
this.sessionLoader = new SessionLoader(this.claudeDir);

// Convenience methods
async listProjects(): Promise<ProjectInfo[]> {
  return this.sessionLoader.listProjects();
}

async listSessions(projectPath?: string): Promise<string[]> {
  const path = projectPath || this.projectDir;
  if (!path) throw new Error('No project path provided');
  return this.sessionLoader.listSessions(path);
}

async getSessionMetadata(sessionId: string, projectPath?: string): Promise<SessionMetadata> {
  const path = projectPath || this.projectDir;
  if (!path) throw new Error('No project path provided');
  return this.sessionLoader.getSessionMetadata(path, sessionId);
}

async readSessionTranscript(
  sessionId: string,
  format: 'raw' | 'jsonl' | 'blocks' = 'blocks',
  options?: ReadSessionOptions & { projectPath?: string }
): Promise<CombinedClaudeTranscript | ParsedJsonlTranscript | ParsedTranscript> {
  const path = options?.projectPath || this.projectDir;
  if (!path) throw new Error('No project path provided');

  switch (format) {
    case 'raw': return this.sessionLoader.readRaw(path, sessionId, options);
    case 'jsonl': return this.sessionLoader.readParsedJsonl(path, sessionId, options);
    case 'blocks': return this.sessionLoader.readBlocks(path, sessionId, options);
  }
}
```

### 6. Exports

Add to `packages/claude-entity-manager/src/index.ts`:

```typescript
export { SessionLoader } from "./loaders/SessionLoader.js";
export type {
  SessionMetadata,
  ProjectInfo,
  ReadSessionOptions,
  ParsedJsonlTranscript
} from "./loaders/SessionLoader.js";
```

### 7. Dependencies

Add to `package.json`:
```json
{
  "dependencies": {
    "@hhopkins/agent-converters": "workspace:*"
  },
  "peerDependencies": {
    "@anthropic-ai/claude-agent-sdk": ">=0.1.0"
  }
}
```

## Implementation Order

1. Update `getClaudeDir()` with env variable support
2. Add new path utilities (`getProjectsDir`, `getProjectDirName`, `getProjectTranscriptDir`)
3. Create `SessionLoader` types
4. Implement `SessionLoader` class
5. Add convenience methods to `ClaudeEntityManager`
6. Update exports
7. Add tests

## Quick Links

- [Sessions](sessions/)
- [claude-entity-manager package](../../../../../packages/claude-entity-manager/)
- [converters package](../../../../../packages/converters/)
- [shared-types package](../../../../../packages/types/)
