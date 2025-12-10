---
name: audit-docs
description: Check documentation for staleness, missing coverage, and broken references
---

# Documentation Audit

Audit the docs folder for issues.

## What to Check

### 1. Broken File References

Search docs for file path references and verify they exist:

```bash
# Find file path patterns in docs
grep -rE '`[a-zA-Z0-9/_-]+\.(ts|js|tsx|jsx|md)`' docs/
```

For each referenced path, verify the file exists.

### 2. Missing Index Entries

For each folder in docs/:
1. Read its index.md
2. List all .md files in the folder
3. Check that each file appears in the index

### 3. Orphaned Docs

Check for docs not linked from any index:
1. List all .md files in docs/
2. Search for links to each file
3. Flag files with no incoming links (except index files)

### 4. Package Coverage

Compare documented packages to actual packages:
1. List packages in packages/ and runtime/
2. Check for corresponding doc in docs/packages/
3. Report undocumented packages

### 5. Stale Content Indicators

Search for patterns indicating staleness:
- `TODO` or `FIXME` in docs
- `Coming soon` or `TBD`
- References to removed files
- Very old date references

## Output Format

Report findings grouped by severity:

```
## Documentation Audit Results

### Errors (Must Fix)
- [ ] Broken reference: docs/packages/foo.md references `src/old-file.ts` (doesn't exist)
- [ ] Missing from index: docs/system/bar.md not in docs/system/index.md

### Warnings (Should Fix)
- [ ] Undocumented package: runtime/server has no doc
- [ ] Orphaned doc: docs/guides/old-guide.md has no incoming links

### Info
- [ ] TODO found: docs/packages/baz.md line 45
- Total docs: X
- Packages documented: Y/Z
```

## Suggested Actions

After listing findings, suggest specific actions:

1. For broken references: Update path or remove reference
2. For missing index entries: Add to index or delete orphaned doc
3. For undocumented packages: Create doc or mark as intentionally undocumented
4. For stale indicators: Update content or remove TODO
