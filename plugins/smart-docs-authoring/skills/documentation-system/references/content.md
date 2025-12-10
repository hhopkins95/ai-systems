# Content Guidelines

How to write documentation content.

## Core Principles

### 1. Document Logic, Not Syntax

**Bad:** "The `createSession` function takes a `SessionConfig` object and returns a `Promise<Session>`"

**Good:** "Sessions are created with a config specifying the agent profile and execution environment. The session doesn't start executing until you call `executeQuery`."

The first just restates the type signature. The second explains behavior.

### 2. Explain Relationships

The most valuable documentation explains how things connect:
- Why does component A call component B?
- What happens when X changes?
- Where does data flow from here?

### 3. Answer "Why"

For architectural decisions, include rationale:

**Without why:**
> ExecutionEnvironment is a concrete class, not an interface.

**With why:**
> ExecutionEnvironment is a concrete class, not an interface. The business logic (calling runner scripts, parsing JSONL) is identical regardless of environment type—only the primitives differ. Making it concrete avoids duplicating this logic across implementations.

### 4. Optimize for Scanning

Readers (human and AI) scan before reading. Help them:
- Put the key point first in each section
- Use tables for comparisons and lists
- Use code blocks for concrete examples
- Keep paragraphs short (3-4 sentences max)

## Document Structure

### Opening

Start with a one-line description of what this doc covers:

```markdown
# Session Lifecycle

How sessions are created, executed, and cleaned up.
```

Not:

```markdown
# Session Lifecycle

## Introduction

This document describes the session lifecycle in the agent-server package...
```

### Sections

Use headers to create scannable structure:

```markdown
## What It Does

Brief description.

## How It Works

The mechanism or flow.

## Key Components

| Component | Purpose |
|-----------|---------|
| X | Does Y |

## Where It Lives

File paths and code references.
```

### Diagrams

Use Mermaid for diagrams:

```markdown
```mermaid
flowchart LR
    A[Client] --> B[Server]
    B --> C[Sandbox]
```
```

Keep diagrams focused—show one concept, not everything.

### Code Examples

Include code when it clarifies, not to fill space:

```typescript
// Good: shows the pattern
const session = await sessionManager.createSession({
  agentProfile: myProfile,
  executionEnvironment: { type: 'modal' }
});

// Then execute
await session.executeQuery("Hello");
```

Don't include:
- Full function implementations (link to source instead)
- Boilerplate setup code
- Every possible option

### Closing

End with links to related docs if relevant:

```markdown
## Related

- [Execution Flow](../system/execution-flow.md) - How queries execute
- [Agent Session API](../packages/agent-server.md#agent-session) - Full API reference
```

## Tone and Voice

### Be Direct

**Verbose:**
> In order to create a new session, you will need to call the createSession method on the sessionManager instance, passing in a configuration object that specifies the agent profile.

**Direct:**
> Create a session with `sessionManager.createSession({ agentProfile })`.

### Use Active Voice

**Passive:** "The transcript is parsed by the converter."
**Active:** "The converter parses the transcript."

### Avoid Hedging

**Hedging:** "This might be useful when you need to..."
**Direct:** "Use this when you need to..."

### Skip Obvious Transitions

Don't write "Next, we'll look at..." or "Now let's discuss...". Just write the next section.

## What to Include

### Always Include

- What it is / what it does (1-2 sentences)
- How it works (the mechanism)
- How it connects to other parts
- Where the code lives

### Include When Relevant

- Key decisions and rationale
- Common patterns or idioms
- Gotchas or non-obvious behavior
- Performance considerations

### Never Include

- Information obvious from code
- Speculation about future changes
- Step-by-step debugging of your thought process
- Apologies or meta-commentary ("This doc is incomplete...")

## Length Guidelines

| Doc Type | Target Length |
|----------|---------------|
| System concept | 100-300 lines |
| Package overview | 150-400 lines |
| Guide | 50-200 lines |
| Index file | 30-80 lines |

If a doc exceeds these significantly, consider splitting it.

## Examples of Good vs Bad

### Package Description

**Bad:**
> The agent-server package is a Node.js package that provides functionality for running AI agents. It uses Modal for sandboxed execution and provides both REST and WebSocket APIs for clients to interact with agent sessions.

**Good:**
> Node.js runtime for AI agents. Manages sessions, executes agents in Modal sandboxes, and streams results via WebSocket.

### Explaining a Flow

**Bad:**
> First, the client sends a request. Then the server receives it. Then it creates a session. Then it spawns a sandbox...

**Good:**
> ```
> Client Request → SessionManager → AgentSession → Modal Sandbox → Runner Script
> ```
>
> The session manager handles the request, creates an AgentSession, which spawns a Modal sandbox running the appropriate runner script.

### Architecture Decision

**Bad:**
> We decided to use an event bus.

**Good:**
> State changes emit through an EventBus rather than direct callbacks. This decouples the WebSocket layer from session internals—the transport subscribes to events without knowing how sessions work internally.
