---
date: 2025-12-19
branch: update-session-state-handling
---

# OpenCode Streaming Parity Fixes (Implemented, Not Yet Verified)

## Context

Implement fixes for four parity issues identified between OpenCode streaming and transcript loading. The goal is to make streaming produce the same state structure as loading from a saved transcript.

**Note:** Fixes are implemented but tests have not been run to verify they work correctly.

## Implemented

### 1. Empty Content in Streaming Blocks
**Root cause:** Events arrive interleaved between sessions. When a block was completed and deleted from `activeBlocks`, late-arriving events recreated it with empty content.

**Solution:**
- Added `completedBlocks` Set to track finished blocks and skip re-creating them
- Use `part.text` (full accumulated text from OpenCode) instead of delta accumulation
- Only complete blocks within the SAME conversation when a new block starts

### 2. Missing user_message in Streaming
**Root cause:** User text parts were being converted to `assistant_text` blocks.

**Solution:**
- Added `messageRoles` Map to track message roles from `message.updated` events
- Check if a text part belongs to a user message (by messageID)
- Create `user_message` block instead of `assistant_text` for user messages

### 3. Duplicate Subagent Entries (call_* and ses_*)
**Root cause:** `subagent:spawned` created entry with `toolUseId`, but block events used `sessionId` as conversationId, creating duplicate entries.

**Solution:**
- Added `pendingTaskTools` stack to track active Task tools
- Added `sessionToToolUseId` Map to link session IDs to tool use IDs
- Handle `session.created` events to create the mapping when subagent sessions start
- Use `toolUseId` as `conversationId` for subagent events (via the mapping)

### 4. Thinking Block Filtering Inconsistency
**Root cause:** Transcript parser filters out empty thinking blocks, but streaming didn't.

**Solution:**
- Added `!state.lastContent?.trim()` check before emitting `block:complete`
- Empty text/reasoning blocks are now skipped (marked completed but not emitted)
- Matches transcript parser behavior in `convertReasoningPart`

## Decisions Made

- **Use part.text instead of delta accumulation**: OpenCode events include full accumulated text in `part.text`, which is more reliable when events arrive out of order
- **Session-to-toolUseId mapping via session.created**: Link subagent sessions to Task tools when `session.created` fires with `parentID` matching main session
- **Filter empty blocks at completion time**: Match transcript parser behavior by skipping blocks with empty/whitespace-only content

## Blockers / Open Questions

- Claude SDK parity issues still need to be fixed (separate session)
- End-to-end streaming test still needed to verify UI behavior

## Next Session

- [ ] Run OpenCode parity tests to verify fixes work
- [ ] Debug and iterate if tests fail
- [ ] Fix Claude SDK parity issues
- [ ] Run end-to-end streaming test

## Files Changed

- `packages/converters/src/opencode/block-converter.ts` - Major refactor to fix all four issues
- `packages/converters/tsconfig.json` - Exclude test files from build
