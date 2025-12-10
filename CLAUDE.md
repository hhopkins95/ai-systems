# AI Systems

## Documentation & Project Tracking

This codebase uses two plugin systems for documentation and work tracking. **Always use these systems when working here.**

### Documentation System (`smart-docs-authoring` plugin)

When writing or updating documentation:

- Follow the documentation system skill for structure and content guidelines
- Documentation lives in `docs/` with three folders: `system/`, `packages/`, `guides/`
- Use the templates in the plugin for new documents
- Run `/audit-docs` periodically to check for staleness

### Project Tracking (`project-tracker` plugin)

When doing multi-session work:

- Use `/start-session` at the beginning of work to load context
- Use `/end-session` when finishing to create a session summary
- Track larger efforts as initiatives in `docs/workspace/initiatives/`
- Use `/new-initiative` to create new tracked work
- Use `/capture-idea` and `/add-todo` for quick captures

### Key Locations

```text
docs/
├── system/              # How the system works (capabilities, concepts)
├── packages/            # Per-package documentation
├── guides/              # How-to guides
└── workspace/           # Project tracking (active work)
    ├── initiatives/     # Multi-session efforts
    │   ├── active/
    │   ├── completed/
    │   └── backlog/
    ├── ideas/           # Quick idea captures
    └── todos/           # Task list
```

