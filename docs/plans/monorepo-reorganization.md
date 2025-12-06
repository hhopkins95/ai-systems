# Monorepo Reorganization Plan

**Created:** December 5, 2024
**Status:** In Progress
**Branch:** misc

---

## Overview

This document outlines the comprehensive plan to reorganize the ai-systems monorepo for better separation of concerns, clearer package boundaries, and improved maintainability.

### Goals

1. Separate runtime packages from core utility packages
2. Extract the sandbox execution app into its own package
3. Create a lightweight converters package for transcript parsing
4. Add runtime types to the shared-types package
5. Improve package naming and organization

---

## Target Structure

```
packages/
├── shared-types/                    # Unchanged location, add runtime types
│   └── src/
│       ├── entities/                # Existing: Skill, Command, Agent, Hook, MemoryFile
│       └── runtime/                 # NEW: ConversationBlock, StreamEvent, Session
│
├── claude-entity-manager/           # Unchanged
│
├── converters/                      # NEW: Pure transformation functions
│   └── src/
│       ├── claude-sdk/
│       │   └── transcript-parser.ts
│       ├── opencode/
│       │   └── transcript-parser.ts
│       └── index.ts
│
├── opencode-adapter/                # Renamed from opencode-claude-adapter
│
├── runtime/                         # GROUPED: Runtime system
│   ├── server/                      # Renamed from agent-runtime
│   │   └── src/
│   │       ├── core/                # SessionManager, EventBus, AgentSession
│   │       ├── lib/sandbox/         # Sandbox orchestration (Modal client)
│   │       └── transport/           # REST + WebSocket
│   │
│   ├── client/                      # Renamed from agent-runtime-react
│   │   └── src/                     # React hooks, Socket.IO client
│   │
│   └── execution/                   # NEW: Extracted from agent-runtime/sandbox
│       └── src/
│           ├── claude-sdk.ts        # Execute Claude queries + convert to blocks
│           ├── opencode.ts          # Execute OpenCode queries + convert
│           └── gemini.ts            # Execute Gemini queries + convert
│
└── apps/
    └── smart-docs/                  # Moved from packages/smart-docs
```

---

## Package Names (npm)

| Location | Package Name | Notes |
|----------|--------------|-------|
| `packages/shared-types` | `@ai-systems/shared-types` | Keep existing |
| `packages/claude-entity-manager` | `@hhopkins/claude-entity-manager` | Keep existing |
| `packages/converters` | `@hhopkins/agent-converters` | New package |
| `packages/opencode-adapter` | `opencode-claude-adapter` | Keep existing name, move location |
| `packages/runtime/server` | `@hhopkins/agent-server` | Renamed from agent-runtime |
| `packages/runtime/client` | `@hhopkins/agent-client` | Renamed from agent-runtime-react |
| `packages/runtime/execution` | `@hhopkins/agent-execution` | New package |
| `packages/apps/smart-docs` | `@hhopkins/smart-docs` | Keep existing |

---

## Dependency Flow

```
shared-types (zero deps)
   │
   ├──► claude-entity-manager
   │         │
   │         └──► opencode-adapter
   │
   ├──► converters (pure functions, depends only on shared-types)
   │         │
   │         ├──► runtime/execution (uses converters to normalize output)
   │         │         │
   │         │         └──► runtime/server (orchestrates execution, receives normalized blocks)
   │         │
   │         └──► runtime/client (can parse blocks client-side if needed)
   │
   └──► apps/smart-docs
```

---

## Key Architectural Changes

### 1. Split AgentArchitectureAdapter Interface

**Current** (mixed concerns):
```typescript
interface AgentArchitectureAdapter {
  initializeSession(...)
  executeQuery(...): AsyncGenerator<StreamEvent>
  readSessionTranscript(): Promise<string | null>
  watchWorkspaceFiles(callback)
  watchSessionTranscriptChanges(callback)
}
```

**Target** (separated concerns):

**Execution Interface** (in `runtime/execution`):
```typescript
interface ExecutionAdapter {
  initialize(options: ExecutionOptions): Promise<void>
  execute(query: string): AsyncGenerator<ConversationBlock>  // Already normalized
}
```

**Orchestration** (in `runtime/server`):
- SDK-agnostic session/sandbox management
- File watching handled at orchestration layer
- Receives normalized ConversationBlocks from execution

**Converters** (in `packages/converters`):
- Pure functions for parsing transcripts
- Used by server for session state reconstruction
- Can be used by client for client-side parsing

### 2. Conversion Happens at Execution Time

The execution layer (running in the sandbox) handles:
1. Running queries against SDKs
2. Converting SDK-specific output to normalized ConversationBlocks
3. Returning normalized output to the server

The server becomes SDK-agnostic — it just orchestrates sandboxes and receives normalized blocks.

### 3. Runtime Types in shared-types

Add to `packages/shared-types/src/runtime/`:
- `conversation-block.ts` — TextBlock, ToolUseBlock, etc.
- `stream-event.ts` — Normalized stream events
- `session.ts` — SessionData, SessionState

---

## Progress Tracking

### Phase 1: Foundation ✅ COMPLETE

- [x] **1.1** Add runtime types to shared-types package
- [x] **1.2** Create converters package structure
- [x] **1.3** Extract transcript parsers from agent-runtime to converters
- [x] **1.4** Extract block converters from agent-runtime to converters
- [x] **1.5** Verify converters package builds and exports correctly

### Phase 2: Execution Package ✅ COMPLETE
- [x] **2.1** Create runtime/execution package structure
- [x] **2.2** Move sandbox scripts from agent-runtime/sandbox to runtime/execution
- [x] **2.3** Update Modal sandbox copy path to use new location
- [x] **2.4** Define ExecutionAdapter interface (types.ts)
- [x] **2.5** Verify execution package builds correctly

### Phase 3: Server Package
- [ ] **3.1** Create runtime/ directory structure
- [ ] **3.2** Move agent-runtime to runtime/server
- [ ] **3.3** Update package.json (name, dependencies)
- [ ] **3.4** Remove code that moved to converters and execution
- [ ] **3.5** Update sandbox orchestration to work with new execution package
- [ ] **3.6** Simplify/remove AgentArchitectureAdapter (use converters + execution)
- [ ] **3.7** Verify server package builds correctly

### Phase 4: Client Package
- [ ] **4.1** Move agent-runtime-react to runtime/client
- [ ] **4.2** Update package.json (name, dependencies)
- [ ] **4.3** Update imports to use new server package
- [ ] **4.4** Verify client package builds correctly

### Phase 5: Other Packages
- [ ] **5.1** Move opencode-claude-adapter to opencode-adapter
- [ ] **5.2** Update package.json and imports
- [ ] **5.3** Move smart-docs to apps/smart-docs
- [ ] **5.4** Update package.json and imports

### Phase 6: Infrastructure
- [ ] **6.1** Update pnpm-workspace.yaml
- [ ] **6.2** Update turbo.json build configuration
- [ ] **6.3** Update root package.json scripts
- [ ] **6.4** Update all cross-package imports
- [ ] **6.5** Run full build, fix any issues
- [ ] **6.6** Update documentation

### Phase 7: Verification
- [ ] **7.1** Verify all packages build
- [ ] **7.2** Verify type exports are correct
- [ ] **7.3** Test runtime flow end-to-end
- [ ] **7.4** Update docs/packages/ documentation

---

## Open Decisions

These are decision points that need to be resolved during implementation:

### Decision 1: Converter Function Signatures
**Question:** What should the exact function signatures be for the converters?
**Options:**
- Generic: `parseTranscript(raw: string, format: 'claude' | 'opencode'): ConversationBlock[]`
- Specific: `parseClaudeTranscript(raw: string): ConversationBlock[]`
- Both: Specific functions with a generic wrapper

**Status:** RESOLVED - Using specific functions per SDK:
- `claudeSdk.parseClaudeTranscriptFile(content)`
- `claudeSdk.convertMessagesToBlocks(messages)`
- `opencode.parseOpenCodeTranscriptFile(content)`
- `opencode.createStreamEventParser(sessionId)` for streaming

### Decision 2: Execution Package Bundling
**Question:** How should the execution package be bundled for deployment to Modal?
**Options:**
- Separate build step that bundles for Modal
- esbuild/rollup bundle as part of package build
- Keep as-is with Modal handling dependencies

**Status:** TBD

### Decision 3: Session State Reconstruction
**Question:** When rebuilding session state from transcripts, where should this logic live?
**Options:**
- In server (uses converters to parse)
- In a shared utility
- In the converters package itself

**Status:** TBD

### Decision 4: Backward Compatibility
**Question:** Should we maintain deprecated exports from old package names?
**Options:**
- Yes, re-export from old names with deprecation warnings
- No, clean break (update all consumers)

**Status:** TBD

### Decision 5: AgentArchitecture Types Location
**Question:** Should AgentArchitecture type and constants move to shared-types?
**Options:**
- Yes, add to shared-types (enables client, server, execution to all reference it)
- No, keep in execution package only
- Partial: Type in shared-types, constants in execution

**Recommendation:** Yes - add to shared-types because:
1. Both server and execution need to reference the architecture type
2. Clients displaying architecture info would import from shared-types
3. Converters already have SDK-specific namespaces - consistent identifier helps
4. It's a simple type with no dependencies

**Status:** RESOLVED - Added to shared-types/src/runtime/architecture.ts

---

## Files to Create

### New Packages
```
packages/converters/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── types.ts                     # Re-export from shared-types
    ├── claude-sdk/
    │   ├── index.ts
    │   └── transcript-parser.ts
    └── opencode/
        ├── index.ts
        └── transcript-parser.ts

packages/runtime/execution/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── types.ts
    ├── claude-sdk.ts
    ├── opencode.ts
    └── gemini.ts
```

### New Directories
```
packages/runtime/                    # New directory
packages/apps/                       # New directory
```

---

## Files to Move

| Current Location | New Location |
|------------------|--------------|
| `packages/agent-runtime/` | `packages/runtime/server/` |
| `packages/agent-runtime-react/` | `packages/runtime/client/` |
| `packages/agent-runtime/sandbox/*` | `packages/runtime/execution/src/` |
| `packages/opencode-claude-adapter/` | `packages/opencode-adapter/` |
| `packages/smart-docs/` | `packages/apps/smart-docs/` |

---

## Files to Extract (from agent-runtime)

| Source | Destination |
|--------|-------------|
| `src/lib/agent-architectures/claude-sdk/claude-transcript-parser.ts` | `packages/converters/src/claude-sdk/` |
| `src/lib/agent-architectures/claude-sdk/block-converter.ts` | `packages/converters/src/claude-sdk/` |
| `src/lib/agent-architectures/opencode/opencode-transcript-parser.ts` | `packages/converters/src/opencode/` |
| `src/lib/agent-architectures/opencode/block-converter.ts` | `packages/converters/src/opencode/` |
| `src/types/session/blocks.ts` (types only) | `packages/shared-types/src/runtime/` |

---

## Risk Mitigation

1. **Breaking Changes**: Work on a feature branch, test thoroughly before merging
2. **Import Paths**: Use find/replace carefully, verify with TypeScript
3. **Runtime Issues**: Test the full flow (server → execution → client) in dev before merge
4. **npm Publishing**: May need to publish packages in correct order due to dependencies

---

## Session Notes

### Session 1 (Dec 5, 2024) - Planning
- Discussed package reorganization goals
- Decided on target structure
- Identified key architectural changes (adapter split, execution normalization)
- Created this planning document

### Session 2 (Dec 5, 2024) - Phase 1 Implementation
- Added runtime types to `shared-types/src/runtime/`:
  - `blocks.ts` - ConversationBlock types and type guards
  - `stream-events.ts` - StreamEvent types and type guards
  - `architecture.ts` - AgentArchitecture type, ArchitectureInfo, ARCHITECTURES constant
  - `index.ts` - exports
- Created `packages/converters/` package:
  - `@hhopkins/agent-converters` npm package
  - Claude SDK transcript parser and block converter
  - OpenCode transcript parser and stream event parser
  - Utility functions (generateId, toISOTimestamp, Logger interface)
- All packages build successfully
- Original agent-runtime code left in place (will be removed in later phases)
- Expanded planning document with detailed phase breakdowns, interfaces, and integration points

### Session 3 (Dec 5, 2024) - Phase 2 Implementation
- Created `packages/runtime/execution/` package:
  - `@hhopkins/agent-execution` npm package
  - Moved `execute-claude-sdk-query.ts` from agent-runtime/sandbox
  - Moved `execute-opencode-query.ts` from agent-runtime/sandbox
  - Added `src/types.ts` with ExecutionAdapter interface types
  - Added `src/index.ts` with exports
- Updated `pnpm-workspace.yaml` to include `packages/runtime/*`
- Updated Modal sandbox copy path in `agent-runtime/src/lib/sandbox/modal/index.ts`
- Skipped Gemini script (unused, can be added later)
- Skipped bulk-write-files.ts (unused, replaced by tar-based writeFiles)
- All packages build successfully

---

## Detailed Phase Breakdown

### Phase 2: Execution Package (Next Up)

The execution package contains the code that **runs inside Modal sandboxes**. This is separate from the server-side orchestration.

**Current location:** `packages/agent-runtime/sandbox/`

**Files to move:**

```
agent-runtime/sandbox/
├── execute-claude-sdk-query.ts    → runtime/execution/src/claude-sdk.ts
├── execute-opencode-query.ts      → runtime/execution/src/opencode.ts
├── execute-gemini-query.ts        → runtime/execution/src/gemini.ts
└── bulk-write-files.ts            → runtime/execution/src/utils/bulk-write.ts
```

**Key changes:**
1. Update imports to use `@hhopkins/agent-converters` for block conversion
2. Define a common `ExecutionAdapter` interface
3. Each execution script returns normalized `ConversationBlock[]` or `StreamEvent[]`
4. Add proper typing for Modal sandbox context

**ExecutionAdapter Interface (proposed):**

```typescript
// packages/runtime/execution/src/types.ts
import type { ConversationBlock, StreamEvent } from '@ai-systems/shared-types';

export type AgentArchitecture = 'claude-sdk' | 'opencode' | 'gemini';

export interface ExecutionContext {
  workspaceDir: string;
  homeDir: string;
  appDir: string;
  bundledMcpDir: string;
}

export interface ExecutionOptions {
  architecture: AgentArchitecture;
  sessionId: string;
  profile: AgentProfile;  // From entity-manager or defined here
  context: ExecutionContext;
}

export interface ExecutionResult {
  blocks: ConversationBlock[];
  metadata?: {
    usage?: TokenUsage;
    costUSD?: number;
    durationMs?: number;
  };
}

// For streaming execution
export interface StreamingExecutor {
  execute(query: string): AsyncGenerator<StreamEvent>;
}
```

**Package structure:**

```
packages/runtime/execution/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts                 # Main exports
    ├── types.ts                 # ExecutionAdapter, ExecutionContext, etc.
    ├── claude-sdk/
    │   ├── index.ts
    │   ├── executor.ts          # Main execution logic
    │   └── session-manager.ts   # SDK session handling
    ├── opencode/
    │   ├── index.ts
    │   ├── executor.ts
    │   └── client.ts            # OpenCode client wrapper
    ├── gemini/
    │   ├── index.ts
    │   └── executor.ts
    └── utils/
        ├── bulk-write.ts
        └── file-sync.ts
```

### Phase 3: Server Package Refactoring

After extraction, the server package (`runtime/server`) will be simplified.

**What stays in server:**
- `core/SessionManager.ts` - Session lifecycle management
- `core/EventBus.ts` - Domain event publishing
- `core/AgentSession.ts` - Individual session state (simplified)
- `lib/sandbox/` - Modal sandbox orchestration (create, manage, terminate)
- `transport/` - REST + WebSocket servers

**What gets removed/simplified:**
- `lib/agent-architectures/` - Moved to converters, delete after Phase 2
- `sandbox/` directory - Moved to execution package
- `AgentArchitectureAdapter` interface - No longer needed

**New server responsibilities:**
1. Spawn sandbox with correct execution script
2. Receive normalized blocks from sandbox
3. Forward blocks to clients via WebSocket
4. Use converters for session state reconstruction from transcripts

**Key interface changes:**

```typescript
// Before: Server knows about SDK-specific adapters
const adapter = createClaudeSdkAdapter(sandbox);
const blocks = await adapter.readSessionTranscript();

// After: Server is SDK-agnostic
const rawTranscript = await sandbox.readFile(transcriptPath);
const blocks = claudeSdk.parseClaudeTranscriptFile(rawTranscript);
// OR for generic handling:
const blocks = parseTranscript(rawTranscript, session.architecture);
```

### Phase 4-5: Package Moves

These are primarily file moves with import updates:

**Client package (`runtime/client`):**
- Move `agent-runtime-react/` to `runtime/client/`
- Update package name to `@hhopkins/agent-client`
- Update imports to use `@hhopkins/agent-server`
- No major code changes expected

**OpenCode adapter:**
- Move `opencode-claude-adapter/` to `opencode-adapter/`
- Keep npm name `opencode-claude-adapter` for compatibility
- No code changes needed

**Smart-docs:**
- Move `smart-docs/` to `apps/smart-docs/`
- No code changes needed

---

## Types to Add to shared-types

### AgentArchitecture Type

```typescript
// packages/shared-types/src/runtime/architecture.ts

/**
 * Supported agent architectures
 */
export type AgentArchitecture = 'claude-sdk' | 'opencode' | 'gemini';

/**
 * Architecture metadata
 */
export interface ArchitectureInfo {
  id: AgentArchitecture;
  displayName: string;
  transcriptFormat: 'jsonl' | 'json';
  supportsSubagents: boolean;
  supportsStreaming: boolean;
}

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
  },
  'gemini': {
    id: 'gemini',
    displayName: 'Gemini',
    transcriptFormat: 'jsonl',
    supportsSubagents: false,
    supportsStreaming: true,
  },
};
```

### Session Types

```typescript
// packages/shared-types/src/runtime/session.ts

import type { ConversationBlock } from './blocks.js';
import type { AgentArchitecture } from './architecture.js';

export type SessionStatus =
  | 'creating'      // Sandbox being provisioned
  | 'ready'         // Ready for queries
  | 'executing'     // Query in progress
  | 'idle'          // Waiting for input
  | 'error'         // Error state
  | 'terminated';   // Session ended

export interface SessionMetadata {
  id: string;
  architecture: AgentArchitecture;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  usage?: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUSD: number;
  };
}

export interface SessionState {
  metadata: SessionMetadata;
  blocks: ConversationBlock[];
  subagents: Map<string, ConversationBlock[]>;
}
```

---

## Integration Points

### Server ↔ Execution Communication

The server spawns execution scripts in Modal sandboxes and communicates via:

1. **Stdout/Stderr streaming** - Execution scripts write StreamEvents as JSON lines
2. **File system** - Transcripts are written to sandbox filesystem, read by server
3. **Exit codes** - 0 = success, non-zero = error

**Execution script output format:**

```jsonl
{"type":"block_start","block":{"type":"assistant_text","id":"..."},"conversationId":"main"}
{"type":"text_delta","blockId":"...","delta":"Hello","conversationId":"main"}
{"type":"block_complete","blockId":"...","block":{...},"conversationId":"main"}
```

### Server ↔ Client Communication

Socket.IO events (unchanged):

- `session:created` - New session available
- `session:updated` - Session metadata changed
- `session:block` - New/updated conversation block
- `session:error` - Error occurred
- `query:submit` - Client submits query
- `query:cancel` - Client cancels query

---

## Files to Delete After Migration

Once all phases are complete, these files can be removed from `agent-runtime`:

```
packages/agent-runtime/
├── sandbox/                           # → runtime/execution (DELETE)
│   ├── execute-claude-sdk-query.ts
│   ├── execute-opencode-query.ts
│   ├── execute-gemini-query.ts
│   └── bulk-write-files.ts
│
└── src/lib/agent-architectures/       # → converters (DELETE)
    ├── base.ts                        # Interface moved to shared-types
    ├── claude-sdk/
    │   ├── index.ts
    │   ├── claude-transcript-parser.ts
    │   ├── block-converter.ts
    │   └── build-mcp-json.ts          # Keep in server or move to execution
    └── opencode/
        ├── index.ts
        ├── opencode-transcript-parser.ts
        ├── block-converter.ts
        └── build-config-json.ts       # Keep in server or move to execution
```

---

## Current State Summary

### What's Done (Phase 1)

1. **shared-types/src/runtime/** - Created with:
   - `blocks.ts` - ConversationBlock types
   - `stream-events.ts` - StreamEvent types
   - `index.ts` - Exports

2. **packages/converters/** - Created with:
   - Claude SDK transcript parser + block converter
   - OpenCode transcript parser + stream event parser
   - Utility functions (generateId, toISOTimestamp, Logger)
   - All building successfully

### What's Not Done Yet

1. ~~**AgentArchitecture types**~~ - ✅ Added to shared-types
2. **Session types** - Need to add to shared-types
3. **Execution package** - Not started
4. **Server refactoring** - Not started
5. **Package moves** - Not started
6. **Cleanup of duplicated code** - agent-runtime still has original files

---

## Related Documents

- `docs/packages/agent-runtime.md` - Current agent-runtime docs
- `docs/packages/claude-entity-manager-architecture.md` - Entity manager architecture
- `docs/session-summaries/2024-12-05-entity-manager-refactor.md` - Related refactor work
