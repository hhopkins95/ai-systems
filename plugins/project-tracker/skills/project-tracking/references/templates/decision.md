# Decision Template

Use this for significant decisions in `decisions/decision-name.md`.

---

```markdown
---
date: [YYYY-MM-DD]
status: accepted
---

# [Decision Title]

## Context

[What situation or problem prompted this decision?]

## Decision

[What was decided? Be specific.]

## Rationale

[Why this choice over alternatives?]

## Alternatives Considered

### [Alternative 1]
[Why not chosen]

### [Alternative 2]
[Why not chosen]

[Optional - include if alternatives were seriously considered]

## Consequences

- [Consequence 1 - positive or negative]
- [Consequence 2]

[What follows from this decision? What trade-offs are we accepting?]
```

---

## Usage Notes

- Not every decision needs a doc - only significant ones
- "Significant" = non-obvious, affects architecture, might be questioned later
- Status can be: `proposed`, `accepted`, `superseded`, `deprecated`
- Link from session summaries when decisions are made
