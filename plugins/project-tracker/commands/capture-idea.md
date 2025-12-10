---
name: capture-idea
description: Quickly capture an idea for later exploration
allowed_tools:
  - Write
---

# Capture Idea

Quick capture of an idea without commitment.

## Process

### 1. Get the Idea

Ask for or use provided:
- **Name**: Short descriptive name
- **Description**: What is this idea?
- **Why**: Why might it be valuable?

### 2. Create Idea File

Write to `docs/workspace/ideas/[idea-name].md`:

```markdown
# [Idea Name]

[What this idea is about - 1-2 sentences]

## Why This Could Be Valuable

[Why it might be worth exploring]

## Initial Thoughts

[Any immediate considerations, questions, or related ideas]

---
*Captured: [today's date]*
```

### 3. Confirm

```markdown
## Idea Captured

**File:** `docs/workspace/ideas/[name].md`

This idea is saved for later exploration. When ready to commit:
- Create initiative: `/new-initiative`
- Or revisit ideas: `docs/workspace/ideas/`
```

## Keep It Light

Ideas should be quick to capture. Don't over-structure:
- A few sentences is fine
- No need for completion criteria
- No need for scope definition
- That comes later if/when it becomes an initiative
