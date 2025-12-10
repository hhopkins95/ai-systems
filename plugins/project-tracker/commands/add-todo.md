---
name: add-todo
description: Add a quick todo item
allowed_tools:
  - Write
---

# Add Todo

Capture a concrete task that doesn't warrant a full initiative.

## Process

### 1. Get the Task

Ask for or use provided:
- **What**: What needs to be done?
- **Context**: Why? Any relevant links or notes?

### 2. Create Todo File

Write to `docs/workspace/todos/[todo-name].md`:

```markdown
# [Todo Name]

[What needs to be done - clear and actionable]

## Context

[Why this matters, any relevant links or notes]

---
*Added: [today's date]*
```

### 3. Confirm

```markdown
## Todo Added

**File:** `docs/workspace/todos/[name].md`

When complete, delete the file or move to `todos/completed/`.
```

## Todo vs Initiative

**Use todo when:**
- Single session or less of work
- Clear, concrete task
- No need for design or planning

**Promote to initiative when:**
- Task grows complex
- Multiple sessions needed
- Requires planning or decisions

## Completing Todos

When a todo is done:
- Delete the file, OR
- Move to `docs/workspace/todos/completed/` if you want history
