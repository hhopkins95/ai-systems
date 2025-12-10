---
name: end-session
description: End a work session by creating a summary and updating initiative status
allowed_tools:
  - Read
  - Write
  - Edit
  - Glob
---

# End Session

Create a session summary and update initiative status.

## Process

### 1. Identify the Initiative

If not obvious, ask which initiative this session was for.

Check `docs/workspace/initiatives/active/` for options.

### 2. Gather Session Information

Ask or infer:
- What was accomplished?
- Were any significant decisions made?
- Are there blockers or open questions?
- What should happen next session?
- What files were changed? (for code work)

### 3. Create Session Summary

Create file: `docs/workspace/initiatives/active/[initiative]/sessions/YYYY-MM-DD-[description].md`

Use the session template:

```markdown
---
date: [today's date]
branch: [if applicable]
---

# [Brief Description]

## Context
[Goal for this session]

## Completed
- [List of accomplishments]

## Decisions Made
- **[Decision]**: [Rationale]

## Blockers / Open Questions
- [Any blockers]

## Next Session
- [ ] [Clear next step]
- [ ] [Clear next step]

## Files Changed
- `path/to/file` - [description]
```

### 4. Update Initiative

Edit `docs/workspace/initiatives/active/[initiative]/INITIATIVE.md`:
- Update "Current Status" section
- Check off any completed criteria
- Add/update blockers section

### 5. Capture Learnings (If Any)

If insights emerged worth preserving:
- Add to `learnings.md` in the initiative folder
- Note which permanent doc they should eventually merge into

### 6. Check for Completion

If all completion criteria are checked:
- Ask if initiative should be marked complete
- If yes, follow completion workflow (merge learnings, move to completed/)

## Output

Confirm what was created/updated:

```markdown
## Session Ended

**Created:** `sessions/2024-12-10-description.md`
**Updated:** `INITIATIVE.md` status

### Summary
- Completed: [brief list]
- Next: [what's queued for next session]
- Blockers: [if any]
```
