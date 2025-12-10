---
name: start-session
description: Start a work session by loading context from active initiatives
allowed_tools:
  - Read
  - Glob
  - Grep
---

# Start Session

Load context and prepare for a work session.

## Process

### 1. List Active Initiatives

Check what's currently in progress:

```
docs/workspace/initiatives/active/
```

### 2. For Each Active Initiative

Read and summarize:
- `INITIATIVE.md` - Current status, blockers, completion criteria
- Most recent session in `sessions/` - What happened last, next steps

### 3. Check Todos

Scan `docs/workspace/todos/` for any outstanding tasks.

### 4. Present Summary

Output format:

```markdown
## Session Start

### Active Initiatives

**[Initiative 1]**
- Status: [status]
- Last session: [date] - [brief summary]
- Next steps: [from last session]
- Blockers: [if any]

**[Initiative 2]**
...

### Outstanding Todos
- [todo 1]
- [todo 2]

### Suggested Focus
[Based on context, suggest what might be good to work on - but let user decide]
```

## If No Active Initiatives

```markdown
## Session Start

No active initiatives found.

**Options:**
- Start a new initiative: `/new-initiative`
- Check backlog: `docs/workspace/initiatives/backlog/`
- Check ideas: `docs/workspace/ideas/`
- Add a todo: `/add-todo`
```

## If User Specifies Focus

If user says "start session on X":
- Focus context loading on that initiative
- Go deeper: read more sessions, check decisions/plans
- Skip unrelated initiatives
