# Workflows

How to perform common project tracking tasks.

## Starting a Session

When beginning work:

### 1. Identify Active Work

```bash
ls docs/workspace/initiatives/active/
```

### 2. Load Context

For each relevant initiative:
1. Read `INITIATIVE.md` for goals and current status
2. Read the most recent 1-2 session files in `sessions/`
3. Note any blockers or open questions
4. Review completion criteria to understand remaining work

### 3. Set Session Goal

Before diving in, be clear on what this session aims to accomplish. This makes the end-of-session summary easier.

## Ending a Session

When finishing work:

### 1. Create Session Summary

Create `docs/workspace/initiatives/active/[initiative]/sessions/YYYY-MM-DD-description.md`

Use the session template. Include:
- What was accomplished
- Decisions made
- Blockers or open questions
- Clear next steps for future sessions

### 2. Update Initiative

Edit `INITIATIVE.md`:
- Update "Current Status" section
- Check off completed criteria
- Add any new blockers

### 3. Capture Learnings (Optional)

If you discovered insights worth preserving:
- Add to `learnings.md` in the initiative
- Note which permanent doc it should eventually merge into

## Creating a New Initiative

### 1. Determine State

| Start in... | When... |
|-------------|---------|
| `active/` | Starting work immediately |
| `backlog/` | Planning for later |

### 2. Create Folder Structure

```bash
mkdir -p docs/workspace/initiatives/active/[initiative-name]/sessions
```

### 3. Create INITIATIVE.md

Use the initiative template. Define:
- Clear goal
- Scope (what's in/out)
- Completion criteria (checkboxes)
- Initial status

### 4. Optional: Create Initial Plan

For complex initiatives, create `plans/` folder with design docs before starting implementation.

## Completing an Initiative

### 1. Verify Completion

- All completion criteria checked?
- No open blockers?
- Work actually done?

### 2. Merge Learnings

If `learnings.md` exists:
1. Review each learning
2. Determine target permanent doc (`docs/system/`, `docs/packages/`, etc.)
3. Add content to permanent docs
4. Optionally note in learnings.md where it was merged

### 3. Final Status Update

Update `INITIATIVE.md`:
- Set status to completed
- Add completion date
- Brief outcome summary

### 4. Move to Completed

```bash
mv docs/workspace/initiatives/active/[name] docs/workspace/initiatives/completed/
```

## Capturing Ideas

Quick capture - don't overthink it.

### 1. Create File

```bash
touch docs/workspace/ideas/[idea-name].md
```

### 2. Write Minimal Content

```markdown
# [Idea Name]

[What it is and why it might be valuable]

## Initial Thoughts

[Any immediate thoughts, questions, or considerations]
```

### 3. That's It

Ideas are cheap. Capture and move on. Revisit later when planning.

### Promoting an Idea to Initiative

When ready to commit:
1. Create initiative in `backlog/` or `active/`
2. Reference or copy relevant content from idea
3. Delete idea file (or leave for reference)

## Adding Todos

Quick task capture.

### 1. Create File

```bash
touch docs/workspace/todos/[todo-name].md
```

### 2. Write Minimal Content

```markdown
# [Todo Name]

[What needs to be done]

## Context

[Why this matters, any relevant links]
```

### 3. Completing Todos

When done, either:
- Delete the file
- Move to `todos/completed/` if you want history

### Promoting a Todo to Initiative

If a todo grows complex:
1. Create initiative
2. Move todo content to INITIATIVE.md
3. Delete todo file

## Moving Initiatives Between States

Just move the folder:

```bash
# Start working on backlog item
mv docs/workspace/initiatives/backlog/[name] docs/workspace/initiatives/active/

# Pause active work
mv docs/workspace/initiatives/active/[name] docs/workspace/initiatives/backlog/

# Complete
mv docs/workspace/initiatives/active/[name] docs/workspace/initiatives/completed/
```

Update `INITIATIVE.md` status field if using frontmatter.

## Handling Blocked Work

When an initiative is blocked:

### 1. Document the Blocker

In most recent session or INITIATIVE.md:
- What's blocking
- Why it's blocking
- What would unblock it

### 2. Decide: Pause or Continue

**If other work can continue:** Keep in `active/`, work on unblocked parts

**If fully blocked:** Consider moving to `backlog/` with clear note about what unblocks it

### 3. Set Reminder

Note in INITIATIVE.md when/how to check if blocker is resolved.

## Session Continuity Best Practices

### For Future AI Sessions

Write session summaries assuming the next session has no memory of this one. Include:
- Enough context to understand what's happening
- Clear statement of what was done
- Explicit next steps, not implied

### For Yourself

Include things you might forget:
- Why you made certain choices
- Dead ends you explored (so you don't repeat them)
- Links to relevant code/docs/resources

### Cross-Session Decisions

If a decision spans sessions or affects future work, create a decision doc rather than burying it in a session summary.
