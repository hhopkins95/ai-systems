# Workspace Structure

Detailed guide to the workspace folder organization and document types.

## Folder Layout

```
docs/workspace/
├── initiatives/
│   ├── active/              # In progress
│   │   └── [initiative-name]/
│   │       ├── INITIATIVE.md
│   │       ├── sessions/
│   │       ├── decisions/
│   │       ├── plans/
│   │       └── learnings.md
│   ├── completed/           # Finished, for reference
│   └── backlog/             # Planned, not started
├── ideas/                   # Exploratory captures
│   └── [idea-name].md
└── todos/                   # Concrete tasks
    └── [todo-name].md
```

## Initiative Folder

Each initiative is a folder containing:

### `INITIATIVE.md` (Required)

The hub document. Always exists.

**Contains:**
- Goal and scope
- Completion criteria (checkboxes)
- Current status summary
- Links to other docs in the initiative

**Updated:** Every session

### `sessions/` (Required)

One file per work session: `YYYY-MM-DD-description.md`

**Contains:**
- What was accomplished
- Decisions made (with links to decision docs if significant)
- Blockers and open questions
- Next steps

**Created:** End of each session

### `decisions/` (Optional)

Significant decisions worth preserving: `decision-name.md`

**Contains:**
- Context (what prompted the decision)
- The decision
- Rationale
- Consequences

**Use when:** Decision is non-obvious, might be questioned later, or affects architecture

### `plans/` (Optional)

Design docs, technical plans: `plan-name.md`

**Contains:**
- Architecture diagrams
- Technical approach
- Migration paths
- Anything needing upfront design

**Use when:** Work requires design before implementation

### `learnings.md` (Optional)

Insights accumulated during the initiative.

**Contains:**
- Architecture insights
- Gotchas discovered
- Patterns worth documenting

**Purpose:** Staging area for content that should merge into permanent docs when initiative completes

## Scaling by Initiative Size

### Small Initiative (1-2 sessions)

```
fix-websocket-reconnect/
├── INITIATIVE.md
└── sessions/
    └── 2024-12-10-implementation.md
```

Just the essentials. Decisions and plans inline in INITIATIVE.md if needed.

### Medium Initiative (3-5 sessions)

```
add-local-execution/
├── INITIATIVE.md
├── sessions/
│   ├── 2024-12-05-design.md
│   ├── 2024-12-07-implementation.md
│   └── 2024-12-09-testing.md
└── decisions/
    └── use-child-process-spawn.md
```

Separate decisions when they're significant.

### Large Initiative (many sessions)

```
execution-env-refactor/
├── INITIATIVE.md
├── sessions/
│   └── [many session files]
├── decisions/
│   ├── concrete-class-not-interface.md
│   └── primitives-abstraction.md
├── plans/
│   └── three-layer-architecture.md
└── learnings.md
```

Full structure. Plans folder for upfront design. Learnings for doc merge.

## Ideas Folder

Simple flat folder for exploratory captures.

```
ideas/
├── voice-interface.md
├── plugin-marketplace.md
└── mobile-app.md
```

**Each file contains:**
- What the idea is
- Why it might be valuable
- Any initial thoughts

**Keep lightweight.** Ideas are cheap to capture, expensive to maintain. A few sentences is fine.

**Promotion:** When an idea becomes concrete, create an initiative in `backlog/` and optionally delete or archive the idea.

## Todos Folder

Simple flat folder for concrete tasks.

```
todos/
├── update-readme.md
├── fix-type-error-in-client.md
└── add-error-boundary.md
```

**Each file contains:**
- What needs to be done
- Why (brief context)
- Any relevant links or notes

**Keep lightweight.** If a todo needs multiple sessions or significant planning, promote to initiative.

**Completion:** Delete the file when done, or move to a `completed/` subfolder if you want history.

## Naming Conventions

**Initiatives:** `kebab-case-descriptive-name/`
- `execution-env-refactor/`
- `add-local-execution/`

**Sessions:** `YYYY-MM-DD-brief-description.md`
- `2024-12-08-primitives-layer.md`

**Decisions:** `kebab-case-decision-name.md`
- `concrete-class-not-interface.md`

**Ideas/Todos:** `kebab-case-name.md`
- `voice-interface.md`
- `fix-type-error.md`

## Initiative States

| State | Folder | Meaning |
|-------|--------|---------|
| Backlog | `initiatives/backlog/` | Planned, not started |
| Active | `initiatives/active/` | Currently being worked on |
| Completed | `initiatives/completed/` | Done |

**Moving between states:** Just move the folder. Update INITIATIVE.md status if needed.

## Integration with Permanent Docs

The workspace is for active/working content. Permanent documentation lives in `docs/system/`, `docs/packages/`, `docs/guides/`.

When an initiative completes:
1. Review `learnings.md` for content worth preserving
2. Merge relevant learnings into appropriate permanent docs
3. Move initiative folder to `completed/`
4. Learnings now live in permanent docs; initiative is archived reference
