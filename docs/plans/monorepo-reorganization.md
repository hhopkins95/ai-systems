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

### Phase 2: Execution Package
- [ ] **2.1** Create runtime/execution package structure
- [ ] **2.2** Move sandbox scripts from agent-runtime/sandbox to runtime/execution
- [ ] **2.3** Update execution scripts to use converters for normalization
- [ ] **2.4** Define ExecutionAdapter interface
- [ ] **2.5** Verify execution package builds correctly

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
  - `index.ts` - exports
- Created `packages/converters/` package:
  - `@hhopkins/agent-converters` npm package
  - Claude SDK transcript parser and block converter
  - OpenCode transcript parser and stream event parser
  - Utility functions (generateId, toISOTimestamp, Logger interface)
- All packages build successfully
- Original agent-runtime code left in place (will be removed in later phases)

---

## Related Documents

- `docs/packages/agent-runtime.md` - Current agent-runtime docs
- `docs/packages/claude-entity-manager-architecture.md` - Entity manager architecture
- `docs/session-summaries/2024-12-05-entity-manager-refactor.md` - Related refactor work
