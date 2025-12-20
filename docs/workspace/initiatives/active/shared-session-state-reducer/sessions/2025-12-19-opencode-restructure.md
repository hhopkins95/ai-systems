---
date: 2025-12-19
branch: update-session-state-handling
---

# OpenCode Converter Restructuring

## Context

Restructure OpenCode converters to match the Claude SDK pattern, where both streaming and transcript paths use the shared reducer. The goal is architecture-agnostic parity.

## Completed

- [x] Created `shared-helpers.ts` - extracted common logic from both transcript-parser and block-converter
  - `mapToolStatus()`, `getPartTimestamp()`, `isTaskTool()`
  - `convertTextPart()`, `convertReasoningPart()`, `convertToolPart()` (with empty block filtering)
  - `extractSubagentFromTaskTool()` - full subagent extraction with metadata.summary parsing
  - `partToEvents()`, `taskToolToEvents()` - new helpers for transcript → events conversion

- [x] Refactored `transcript-parser.ts` to use events + reducer
  - No longer builds `SessionConversationState` directly
  - Now: `JSON → transcriptToEvents() → events → reduceSessionEvent() → state`
  - Uses shared helpers for consistent block conversion

- [x] Simplified `block-converter.ts`
  - Removed `pendingBlocks` Map (no more deferred block:start)
  - Removed complex pending block promotion logic
  - Kept `activeBlocks` for content accumulation and block completion
  - Added `opcodeEventToSessionEvents()` convenience function
  - Now emits `subagent:spawned` and `subagent:completed` events for task tools

- [x] Updated `index.ts` exports
  - Added new exports: `opencodeEventToSessionEvents`, shared helpers
  - Kept deprecated exports for backward compatibility

- [x] Created OpenCode parity tests (`src/test/opencode/transcript-parser.test.ts`)
  - Compares streaming vs transcript loading
  - Outputs comparison files to `output/` directory

## Decisions Made

- **Remove pending block logic**: Claude SDK doesn't have it, and empty blocks can be filtered in UI if needed. This simplifies the converter significantly.

- **Keep minimal state in block-converter**: Content accumulation and block completion still require tracking active blocks. This is unavoidable for proper `block:complete` emission.

- **Emit block:start immediately**: No more deferring until first delta. Matches Claude SDK behavior.

## Blockers / Open Questions

**Parity test failures identified significant discrepancies:**

| Metric | Streaming | Transcript |
|--------|-----------|------------|
| Main blocks | 23 | 13 |
| Subagent count | 4 | 2 |
| user_message | 0 | 1 |
| thinking blocks | 6 | 0 |
| assistant_text | 7 | 4 |
| tool_use | 5 | 3 |

**Root causes to investigate:**

1. **Missing user_message in streaming** - Streaming parser doesn't emit user message blocks
2. **Extra thinking blocks in streaming** - Transcript filters empty reasoning, streaming doesn't
3. **Extra tool_use blocks in streaming** - Task tools emit tool_use + subagent blocks
4. **Different subagent routing** - Streaming routes blocks to subagent sessions, transcript embeds in main

## Next Session

- [ ] Fix user_message handling in streaming path (need to emit from user message events)
- [ ] Filter empty thinking/reasoning blocks in streaming (like transcript does)
- [ ] Align subagent block handling - decide if task tools should emit tool_use or just subagent
- [ ] Investigate subagent routing differences
- [ ] Get parity tests passing

## Files Changed

- `packages/converters/src/opencode/shared-helpers.ts` - Created (new shared helper functions)
- `packages/converters/src/opencode/transcript-parser.ts` - Refactored to use events + reducer
- `packages/converters/src/opencode/block-converter.ts` - Simplified, removed pending block logic
- `packages/converters/src/opencode/index.ts` - Updated exports
- `packages/converters/src/test/opencode/transcript-parser.test.ts` - Created parity tests
