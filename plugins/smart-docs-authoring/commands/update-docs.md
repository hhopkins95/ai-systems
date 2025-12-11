---
name: update-docs
description: Update documentation to reflect recent code changes
---

# Update Documentation

Update project documentation to reflect recent code changes.

## Process

### 1. Identify What Changed

First, determine what was recently modified:

```bash
# Check recent git changes (if available)
git diff --name-only HEAD~5 2>/dev/null || echo "No git history"

# Or check for files modified today
find . -name "*.ts" -o -name "*.js" -o -name "*.py" -mtime -1 -type f 2>/dev/null | head -20
```

Ask the user what changes need documentation updates if unclear.

### 2. Find Related Documentation

For each changed component:

1. Search for existing docs that reference the changed files
2. Look for README files in the same directory
3. Check for a docs/ folder with related content
4. Find any markdown files that mention the component name

```bash
# Find docs referencing a file
grep -r "filename" docs/ *.md 2>/dev/null
```

### 3. Update Documentation

For each doc that needs updating:

1. **Read the current doc** to understand its structure
2. **Read the changed code** to understand what's new
3. **Update relevant sections**:
   - Add new features/components to existing tables
   - Update code examples if APIs changed
   - Add new sections for new functionality
   - Update diagrams if architecture changed
   - Fix any broken file path references

### 4. Maintain Consistency

- Use existing doc structure (don't reorganize unless asked)
- Keep the same tone and format as surrounding content
- Match heading levels and formatting conventions
- Preserve existing cross-references

### 5. Verify Updates

After updating:

1. Check that code examples compile/run correctly
2. Verify file paths referenced in docs exist
3. Ensure links to other docs are valid

## Output

Summarize what was updated:

```markdown
## Documentation Updates

### Updated
- path/to/doc.md - Added new feature section
- README.md - Updated installation steps

### Skipped (no changes needed)
- path/to/other.md - Content still accurate

### Suggested
- Consider documenting the new X workflow
```

## Tips

- When in doubt, ask the user which changes need documentation
- Prefer updating existing docs over creating new ones
- Don't document internal implementation details unless they're public API
- Focus on user-facing APIs and behaviors
- Keep examples minimal but complete
