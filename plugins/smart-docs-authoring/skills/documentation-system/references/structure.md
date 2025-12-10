# Documentation Structure

Detailed guidelines for organizing documentation.

## The Three Folders

### `system/`

Documentation about how the system works as a whole.

**Contains:**
- Capabilities (what the system does, business-facing)
- Concepts (cross-cutting technical ideas like "how blocks work")
- Flows (data flow, execution flow, request lifecycle)
- Architecture decisions that span multiple packages

**Examples:**
- `system/agent-execution.md` - How agents run in sandboxes
- `system/real-time-streaming.md` - How responses stream to UIs
- `system/block-system.md` - How all output becomes typed blocks

**Does NOT contain:**
- Package-specific internals
- Step-by-step instructions (those go in guides)

### `packages/`

Documentation for individual packages/modules.

**Contains:**
- Package overview (what it does, why it exists)
- Architecture (internal structure, key components)
- Key types and interfaces
- How it connects to other packages

**Examples:**
- `packages/agent-server.md` - The runtime package
- `packages/converters.md` - Transcript conversion utilities

**Does NOT contain:**
- Cross-cutting concepts (those go in system)
- How-to instructions (those go in guides)

### `guides/`

Task-oriented documentation for accomplishing specific goals.

**Contains:**
- Getting started guides
- How to add/modify/configure things
- Troubleshooting guides
- Integration guides

**Examples:**
- `guides/getting-started.md`
- `guides/adding-a-skill.md`
- `guides/custom-persistence.md`

**Does NOT contain:**
- Conceptual explanations (those go in system)
- Package internals (those go in packages)

## Index Files

Every folder has an `index.md` that provides:

1. **Brief description** of what's in this folder
2. **Navigation table** linking to contents with descriptions
3. **Guidance** on which doc to read for what purpose

Example:

```markdown
# System Documentation

How the system works at a conceptual level.

## Contents

| Document | Read this to understand... |
|----------|---------------------------|
| [Agent Execution](agent-execution.md) | How agents run in sandboxes |
| [Real-Time Streaming](real-time-streaming.md) | How responses stream to UIs |
| [Block System](block-system.md) | How all output becomes typed blocks |

## Where to Start

- New to the codebase? Start with [Agent Execution](agent-execution.md)
- Building a UI? Read [Real-Time Streaming](real-time-streaming.md)
```

## File vs Folder Decision

**Default to a single file** for each package or concept.

Expand to a folder when:
- The file exceeds ~300 lines
- There are 3+ distinct subsections that could stand alone
- Different audiences need different parts
- Package-specific guides are needed

## Nested Structure (Fractal Pattern)

When a package needs expansion, use the same three-folder structure:

```
packages/
└── agent-server/
    ├── index.md           # Package overview
    ├── system/            # How agent-server works internally
    │   ├── session-lifecycle.md
    │   └── event-flow.md
    ├── packages/          # Sub-components
    │   ├── core.md
    │   ├── transport.md
    │   └── execution.md
    └── guides/            # Package-specific how-tos
        └── custom-primitives.md
```

**Rules for nesting:**
- Only nest when truly needed (most packages stay as single files)
- Maximum 2 levels deep
- Use the same `system/packages/guides/` structure
- Each level has its own `index.md`

If you need deeper nesting, the code architecture probably needs refactoring.

## Naming Conventions

**Files:** kebab-case, descriptive
- `agent-execution.md` not `agentExecution.md` or `execution.md`
- `getting-started.md` not `start.md`

**Folders:** kebab-case, match package names where applicable
- `agent-server/` matches `@hhopkins/agent-server`

## Cross-References

Link between docs using relative paths:

```markdown
See [Block System](../system/block-system.md) for how this integrates.
```

Reference code locations with file:line format:

```markdown
The session manager lives at `runtime/server/src/core/session-manager.ts`.
```

## When NOT to Create a Doc

Don't create documentation for:
- Trivial packages with self-explanatory code
- Features still in active development (wait until stable)
- Information that duplicates what's in code comments
- Content that will be auto-generated (API docs, type exports)
