# Session Template

Use this for creating session summaries in `sessions/YYYY-MM-DD-description.md`.

---

```markdown
---
date: [YYYY-MM-DD]
branch: [git-branch-if-applicable]
---

# [Brief Description of Session]

## Context

[What was the goal for this session? What state were we in?]

## Completed

- [Thing 1]
- [Thing 2]
- [Thing 3]

## Decisions Made

- **[Decision]**: [Brief rationale]

[For significant decisions, link to decision doc: See [decision-name](../decisions/decision-name.md)]

## Blockers / Open Questions

- [Blocker or question 1]
- [Question 2]

[Remove section if none]

## Next Session

- [ ] [Clear next step 1]
- [ ] [Clear next step 2]

## Files Changed

- `path/to/file.ts` - [Brief description]
- `path/to/other.ts` - [Brief description]

[Optional - useful for code-heavy sessions]
```

---

## Usage Notes

- Write assuming the next reader has no context from this session
- "Completed" should be concrete - what's actually done
- "Next Session" is critical for continuity - be specific
- Files Changed is optional but helpful for code work
- Keep it scannable - bullets over paragraphs
