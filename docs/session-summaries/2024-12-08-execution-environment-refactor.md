# Session Summary: Execution Environment Architecture Refactor

**Date:** December 8, 2024
**Branch:** `add-exec-env`

---

## Overview

This session focused on redesigning the execution environment architecture in `@hhopkins/agent-server` to create a cleaner separation of concerns between:
1. **EnvironmentPrimitives** - Low-level operations (exec, file I/O, watch) that vary by environment type
2. **ExecutionEnvironment** - Business logic layer that coordinates runner scripts
3. **Runner scripts** - Architecture-specific logic (Claude SDK, OpenCode) that runs inside environments

---

## Key Decisions Made

### 1. Three-Layer Architecture

```
AgentSession (consumer-facing API)
    │
    ▼
ExecutionEnvironment (single concrete class - business logic)
    │
    ├── uses EnvironmentPrimitives internally (Modal/Local/Docker)
    │
    └── calls Runner CLI scripts:
            • setup-session
            • execute-query
            • read-transcript (planned)
```

**Rationale:** The previous architecture had `ModalSandboxExecutionEnvironment` mixing primitive operations with business logic. This made it impossible to add new environment types without duplicating all the business logic.

### 2. ExecutionEnvironment as Concrete Class (not interface)

Changed from an interface with multiple implementations to a single concrete class that:
- Takes configuration specifying environment type
- Builds its own primitives via factory internally
- Owns all the "smart" logic about sessions, transcripts, file management

```typescript
const env = await ExecutionEnvironment.create({
  sessionId: 'session-123',
  architecture: 'claude-agent-sdk',
  agentProfile: { ... },
  environmentOptions: { type: 'modal', modal: { ... } },
});
```

**Rationale:** The business logic (how to call runner scripts, parse JSONL, etc.) is the same regardless of environment type. Only the primitives differ.

### 3. EnvironmentPrimitives Interface

Defines the minimal operations needed to run in any environment:

```typescript
interface EnvironmentPrimitive {
  getId(): string;
  getBasePaths(): { APP_DIR, WORKSPACE_DIR, HOME_DIR, BUNDLED_MCP_DIR };
  exec(command: string[], options?): Promise<ExecHandle>;
  readFile(path: string): Promise<string | null>;
  writeFile(path: string, content: string): Promise<void>;
  writeFiles(files: FileEntry[]): Promise<WriteFilesResult>;
  listFiles(path: string, pattern?: string): Promise<string[]>;
  watch(path: string, callback: WatchCallback, opts?): Promise<void>;
  isRunning(): Promise<boolean>;
  poll(): Promise<number | null>;
  terminate(): Promise<void>;
}
```

### 4. Static Factory Method Pattern

ExecutionEnvironment uses `static async create()` pattern because primitive creation is async:

```typescript
static async create(config: ExecutionEnvironmentConfig): Promise<ExecutionEnvironment>
```

---

## Completed Work

### 1. EnvironmentPrimitives Infrastructure
**Location:** `runtime/server/src/lib/environment-primitives/`

- `base.ts` - EnvironmentPrimitive interface and related types
- `factory.ts` - `getEnvironmentPrimitive()` factory function
- `modal/index.ts` - ModalSandbox implementation

### 2. ExecutionEnvironment Class
**File:** `runtime/server/src/core/execution-environment.ts`

Converted from interface to concrete class with:
- `ExecutionEnvironmentConfig` type for constructor
- `static create()` factory method
- Implemented methods: `getId()`, `getBasePaths()`, `getWorkspaceFiles()`, `watchWorkspaceFiles()`, `isHealthy()`, `cleanup()`
- Stub methods (throw "not implemented"): `prepareSession()`, `executeQuery()`, `readSessionTranscript()`, `watchSessionTranscriptChanges()`

### 3. AgentSession Updates
**File:** `runtime/server/src/core/agent-session.ts`

- Updated imports to use new `ExecutionEnvironment` class
- Changed factory call from `getExecutionEnvironment(...)` to `ExecutionEnvironment.create({...})`
- Imported `WorkspaceFileEvent`, `TranscriptChangeEvent` from execution-environment

---

## Remaining Work

### High Priority

#### 1. Implement `prepareSession()` in ExecutionEnvironment
**File:** `runtime/server/src/core/execution-environment.ts`

Wire up to runner's `setup-session.ts` script:
- Build `SetupSessionInput` from args
- Call `primitives.exec(['node', '/app/setup-session.js'], { stdin: JSON.stringify(input) })`
- Parse result

#### 2. Implement `executeQuery()` in ExecutionEnvironment
**File:** `runtime/server/src/core/execution-environment.ts`

Wire up to runner's `execute-query.ts` script:
- Build command with args
- Call `primitives.exec()` and stream stdout
- Parse JSONL lines into StreamEvents

#### 3. Implement `readSessionTranscript()` / `watchSessionTranscriptChanges()`

Options:
- Add new `read-transcript.ts` script to runner (recommended)
- Or move transcript path knowledge into runner and expose via script

### Medium Priority

#### 4. Implement LocalPrimitives
**File:** `runtime/server/src/lib/environment-primitives/local/index.ts`

Implement EnvironmentPrimitive using:
- `child_process.spawn()` for exec
- `fs` module for file operations
- `chokidar` for watching

#### 5. Clean Up Old Code
**Location:** `runtime/server/src/lib/_old/`

Remove deprecated execution environment implementations once new system is complete.

#### 6. Update Documentation
**Files:**
- `docs/packages/agent-server.md` - Update architecture diagram
- `docs/packages/agent-execution.md` - Rename to agent-runner.md, update content

---

## File Changes Summary

### New Files
```
runtime/server/src/lib/environment-primitives/
├── base.ts
├── factory.ts
└── modal/
    ├── index.ts
    ├── client.ts
    └── create-sandbox.ts
```

### Modified Files
```
runtime/server/src/core/execution-environment.ts  # Interface → Class
runtime/server/src/core/agent-session.ts          # Updated imports and factory call
```

### Files to Update Later
```
docs/packages/agent-server.md     # Architecture diagram outdated
docs/packages/agent-execution.md  # Should be renamed to agent-runner.md
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  AgentSession                                               │
│  (consumer-facing, manages lifecycle, exposes API)          │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  ExecutionEnvironment (single concrete class)               │
│  - Coordinates runner script calls                          │
│  - Parses JSONL → StreamEvents                              │
│  - Knows script names/args, not architecture internals      │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  EnvironmentPrimitives (interface)                          │
│  ├── ModalPrimitives (sandbox.exec, sandbox.open)           │
│  ├── LocalPrimitives (child_process, fs) [TODO]             │
│  └── DockerPrimitives [future]                              │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  Runner Scripts (inside the environment)                    │
│  - setup-session.ts                                         │
│  - execute-query.ts                                         │
│  - read-transcript.ts [planned]                             │
│  Contains all architecture-specific knowledge               │
└─────────────────────────────────────────────────────────────┘
```

---

## Testing Notes

- Type checking passes for `execution-environment.ts` and `agent-session.ts`
- Remaining type errors are in other files that reference old/deprecated code
- No runtime testing done - methods still throw "not implemented"

---

## Related Documentation

- Plan file: `/Users/hunterhopkins/.claude/plans/zany-stirring-hickey.md`
- Existing docs: `docs/packages/agent-server.md`, `docs/packages/agent-execution.md`
