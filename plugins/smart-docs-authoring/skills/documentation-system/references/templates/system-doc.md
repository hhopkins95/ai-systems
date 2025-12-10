# System Document Template

Use this template for documenting capabilities, concepts, and cross-cutting concerns.

---

```markdown
# [Capability/Concept Name]

[One-line description of what this is.]

## What It Does

[2-3 sentences explaining the capability from a user/business perspective. What problem does it solve? Why does it exist?]

## How It Works

[Explain the mechanism. This is the core of the doc.]

[Include a diagram if the flow involves multiple components:]

```mermaid
flowchart LR
    A[Component A] --> B[Component B]
    B --> C[Component C]
```

[Walk through the flow in prose, explaining each step:]

1. [First thing that happens]
2. [Second thing that happens]
3. [Result]

## Key Components

| Component | Package | Purpose |
|-----------|---------|---------|
| [Name] | [package-name] | [What it does in this flow] |

## Key Insight

[Optional: One or two sentences capturing the most important architectural insight. What's the "aha" that makes this design make sense?]

## Where It Lives

| Concern | Location |
|---------|----------|
| [Aspect 1] | `path/to/file.ts` |
| [Aspect 2] | `path/to/other.ts` |

## Related

- [Related System Doc](related-doc.md) - [Why it's related]
- [Package Doc](../packages/package.md) - [Why it's related]
```

---

## Usage Notes

- Keep "What It Does" business-focused, "How It Works" technical
- The diagram should show the happy path, not every edge case
- "Key Insight" is optional but valuable for non-obvious designs
- Link to package docs for component details, don't duplicate here
