---
name: new-initiative
description: Create a new initiative for tracking multi-session work
allowed_tools:
  - Write
  - Bash
---

# New Initiative

Create a new initiative with proper folder structure.

## Process

### 1. Gather Information

Ask for or infer:
- **Name**: Short kebab-case name (e.g., `add-local-execution`)
- **Goal**: What are we trying to accomplish?
- **Scope**: What's in/out of scope?
- **Completion criteria**: How do we know when it's done?
- **State**: Start in `active/` or `backlog/`?

### 2. Create Folder Structure

```bash
mkdir -p docs/workspace/initiatives/[state]/[initiative-name]/sessions
```

### 3. Create INITIATIVE.md

Write `docs/workspace/initiatives/[state]/[initiative-name]/INITIATIVE.md`:

```markdown
---
title: [Initiative Name]
created: [today's date]
status: [active|backlog]
---

# [Initiative Name]

## Goal

[What we're trying to accomplish and why]

## Scope

**In scope:**
- [Item 1]
- [Item 2]

**Out of scope:**
- [Item explicitly excluded]

## Completion Criteria

- [ ] [Criterion 1]
- [ ] [Criterion 2]
- [ ] [Criterion 3]
- [ ] Documentation updated

## Current Status

[Initial status - typically "Not started" or "Starting initial design"]

## Quick Links

- [Sessions](sessions/)
```

### 4. Optional: Create Initial Plan

For complex initiatives, ask if upfront design is needed.

If yes, create `plans/` folder and initial plan document.

### 5. Confirm Creation

```markdown
## Initiative Created

**Location:** `docs/workspace/initiatives/[state]/[name]/`
**Status:** [active|backlog]

**Structure:**
```
[name]/
├── INITIATIVE.md
└── sessions/
```

**Next:** [Suggest starting first session if active, or note it's in backlog]
```

## Promoting from Idea

If user references an existing idea:
1. Read the idea file from `docs/workspace/ideas/`
2. Use its content to populate the initiative
3. Ask if the idea file should be deleted
