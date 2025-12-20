---
date: 2025-12-19
status: complete
---

# Session: Parity Tests Setup

## Summary

Set up Vitest infrastructure and created parity tests comparing streaming vs transcript loading for Claude SDK. Tests successfully identify discrepancies between the two code paths.

## What Was Done

### 1. Cleaned Up Transcript Parser

Removed unused exports from `packages/converters/src/claude-sdk/transcript-parser.ts`:
- `extractSubagentId` - never used
- `detectSubagentStatus` - no longer needed since reducer handles status via events

### 2. Set Up Vitest

- Added `vitest` to devDependencies
- Created `vitest.config.ts`
- Added `test` script to package.json

### 3. Created Parity Test

**File:** `packages/converters/src/test/claude/transcript-parser.test.ts`

Test compares two ways of building `SessionConversationState`:

1. **Streaming path:** `raw-sdk-messages.jsonl` → `sdkMessageToEvents()` → reducer
2. **Transcript path:** Combined JSON → `parseCombinedClaudeTranscript()`

Key insight: `parent_tool_use_id` field in raw SDK messages distinguishes main conversation (`null`) from subagent events.

### 4. Test Data

- `raw-sdk-messages.jsonl` - 249 lines (added initial user message)
- `main-transcript.jsonl` - 12 lines
- `subagent-transcript.jsonl` - 5 lines

Output written to `src/test/claude/output/` for inspection.

## Parity Issues Found

| Issue | Streaming | Transcript |
|-------|-----------|------------|
| Extra text block | Has duplicate `assistant_text` | - |
| Subagent block | Creates `subagent` block on spawn | Missing |
| Block ordering | `tool_result, skill_load` | `skill_load, tool_result` |
| Subagent blocks | Missing `assistant_text` blocks | Has all blocks |

## Files Modified

| File | Changes |
|------|---------|
| `packages/converters/package.json` | Added vitest, test script |
| `packages/converters/vitest.config.ts` | Created |
| `packages/converters/src/claude-sdk/transcript-parser.ts` | Removed unused exports |
| `packages/converters/src/claude-sdk/index.ts` | Updated exports |
| `packages/converters/src/test/claude/transcript-parser.test.ts` | Created |
| `packages/converters/src/test/claude/raw-sdk-messages.jsonl` | Added initial user message |

## Next Steps

1. Apply same parity testing approach to OpenCode implementation
2. Fix identified parity issues in Claude SDK converter
3. End-to-end streaming test
