# Documentation Maintenance

When and how to update documentation.

## When to Update Docs

### Must Update

- **Behavior changes** - If how something works changes, docs must reflect it
- **API changes** - New parameters, removed methods, changed return types
- **Renamed/moved files** - Update file path references
- **New capabilities** - Document new features in appropriate location
- **Removed features** - Remove or mark as deprecated

### Should Update

- **Significant refactors** - If internal structure changes substantially
- **New patterns established** - If you introduce a pattern others should follow
- **Clarifications needed** - If you found the docs confusing while working

### Don't Update

- **Minor refactors** - Internal changes that don't affect behavior
- **Bug fixes** - Unless the bug was documented as expected behavior
- **Performance optimizations** - Unless they change usage patterns

## Finding Affected Docs

When you change code, find related docs:

1. **Search for file paths** - Grep docs for the changed file path
2. **Search for type/function names** - Look for references to changed APIs
3. **Check package docs** - If changing a package, check its doc
4. **Check system docs** - If changing cross-cutting behavior

```bash
# Find docs referencing a file
grep -r "session-manager" docs/

# Find docs mentioning a type
grep -r "AgentSession" docs/
```

## Update Workflow

### For Code Changes

1. Make the code change
2. Search for affected docs (see above)
3. Update descriptions if behavior changed
4. Update code paths if files moved
5. Update examples if API changed
6. Verify cross-references still work

### For New Features

1. Determine doc type (system concept, package feature, or guide)
2. Check if it extends an existing doc or needs a new one
3. Write using appropriate template
4. Add to relevant index.md
5. Add cross-references from related docs

### For Removed Features

1. Remove the documentation section
2. Check for cross-references and update them
3. If the whole doc is obsolete, delete it and remove from index
4. Don't leave stubs like "This feature was removed"

## Staleness Indicators

Signs that docs may be stale:

- **File paths that don't exist** - Dead references
- **Types/functions not in codebase** - Outdated API docs
- **Descriptions that don't match behavior** - Drift
- **"TODO" or "Coming soon"** - Unfulfilled promises
- **Old date references** - Time-sensitive content

## Periodic Review

Occasionally audit docs for staleness:

1. List all docs in `docs/`
2. For each doc, verify:
   - File paths still exist
   - Descriptions match current behavior
   - Examples still work
   - Cross-references resolve
3. Update or remove stale content

## Cross-Reference Maintenance

When renaming or moving docs:

1. Search for links to the old path
2. Update all references to new path
3. Consider leaving a redirect note temporarily if widely linked

```bash
# Find references to a doc
grep -r "old-doc-name.md" docs/
```

## Version Considerations

For versioned software:

- Document current behavior, not historical
- Don't maintain multiple versions of docs unless necessary
- If breaking changes occur, update docs to match new behavior
- Use changelogs (in project tracking, not here) for version history

## Doc Ownership

Docs don't have formal owners, but:

- If you change code, you're responsible for updating related docs
- If you find stale docs while working, fix them or note them
- Don't leave docs in a worse state than you found them

## Common Mistakes

### Over-Updating

Don't update docs for every small change. If behavior is the same, docs don't need changing.

### Under-Updating

Don't skip doc updates because "I'll do it later." Later rarely comes.

### Orphaned Docs

When removing features, remove their docs. Dead docs are worse than no docs.

### Stale Examples

Code examples rot fast. Keep them minimal so there's less to maintain.

### Broken Cross-References

After moving/renaming, always search for references. Broken links frustrate readers.
