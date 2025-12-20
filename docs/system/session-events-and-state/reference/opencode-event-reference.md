# OpenCode Event System Reference

This document provides a comprehensive reference for OpenCode's SSE event system, message structures, part types, and state machines. Use this as the authoritative source when implementing event parsing.

---

## Table of Contents

1. [SSE Event Types](#1-sse-event-types)
2. [Message Lifecycle](#2-message-lifecycle)
3. [Part Types Reference](#3-part-types-reference)
4. [Tool State Machine](#4-tool-state-machine)
5. [Task Tool / Subagent Specifics](#5-task-tool--subagent-specifics)
6. [Session Lifecycle](#6-session-lifecycle)
7. [ID Relationships](#7-id-relationships)
8. [Real Examples](#8-real-examples)

---

## 1. SSE Event Types

OpenCode uses Server-Sent Events (SSE) at the `/global/event` endpoint. All state changes are broadcast through this event bus.

### Event Type Inventory

| Event Type | Category | Purpose |
|------------|----------|---------|
| `server.connected` | Server | Initial SSE connection established |
| `message.updated` | Message | Message created or updated (user or assistant) |
| `message.removed` | Message | Message deleted |
| `message.part.updated` | Part | Part content streaming/update |
| `message.part.removed` | Part | Part deleted |
| `session.created` | Session | New session created (including subagent sessions) |
| `session.updated` | Session | Session info changed |
| `session.status` | Session | Session busy/idle/retry status changed |
| `session.idle` | Session | Session became idle (streaming complete) |
| `session.error` | Session | Error occurred in session |
| `session.deleted` | Session | Session deleted |
| `session.compacted` | Session | Session was compacted |
| `session.diff` | Session | Session file differences |
| `file.edited` | File | File was edited |
| `file.watcher.updated` | File | File watcher detected change (add/change/unlink) |
| `permission.updated` | Permission | Permission request created |
| `permission.replied` | Permission | Permission response received |
| `todo.updated` | Todo | Todo list changed |
| `lsp.client.diagnostics` | LSP | LSP diagnostics from server |
| `lsp.updated` | LSP | LSP server state changed |
| `vcs.branch.updated` | VCS | VCS branch changed |
| `command.executed` | Command | Command executed |
| `installation.updated` | Installation | Version update available |
| `installation.update-available` | Installation | New version notification |
| `tui.prompt.append` | TUI | Append text to prompt |
| `tui.command.execute` | TUI | Execute TUI command |
| `tui.toast.show` | TUI | Show toast notification |

### Event Structure

All events have this base structure:
```typescript
{
  type: string;           // Event type (e.g., "message.part.updated")
  properties: {           // Event-specific payload
    // ... varies by event type
  }
}
```

---

## 2. Message Lifecycle

Messages are the primary containers for conversation turns. There are two types: `UserMessage` and `AssistantMessage`.

### User Message Structure

```typescript
// Event: message.updated (role="user")
{
  type: "message.updated",
  properties: {
    info: {
      id: string,                    // Message ID (e.g., "msg_b38d16ed7001...")
      sessionID: string,             // Parent session ID
      role: "user",
      time: {
        created: number              // Unix timestamp in milliseconds
      },
      agent: string,                 // Agent name (e.g., "build")
      model: {                       // NESTED object for user messages
        providerID: string,          // e.g., "opencode"
        modelID: string              // e.g., "big-pickle"
      },
      system?: string,               // System prompt (optional)
      tools?: Record<string, boolean>, // Enabled tools (optional)
      summary?: {
        title?: string,
        body?: string,
        diffs: FileDiff[]
      }
    }
  }
}
```

### Assistant Message Structure

```typescript
// Event: message.updated (role="assistant")
{
  type: "message.updated",
  properties: {
    info: {
      id: string,                    // Message ID
      sessionID: string,             // Parent session ID
      role: "assistant",
      parentID: string,              // Parent message ID (links to user message)
      time: {
        created: number,
        completed?: number           // When message finished
      },

      // NOTE: These are FLAT, not nested like user messages!
      modelID: string,               // e.g., "big-pickle"
      providerID: string,            // e.g., "opencode"

      mode: string,                  // Agent mode (e.g., "build")
      agent: string,                 // Agent name
      path: {
        cwd: string,                 // Working directory
        root: string                 // Project root
      },

      // Token/cost tracking
      cost: number,                  // Monetary cost
      tokens: {
        input: number,
        output: number,
        reasoning: number,           // Extended thinking tokens
        cache: {
          read: number,              // Prompt cache reads
          write: number              // Prompt cache writes
        }
      },

      finish?: string,               // Finish reason ("stop", "length", etc.)
      error?: ErrorType,             // If message failed
      summary?: boolean              // Is summary message
    }
  }
}
```

### Critical Difference: User vs Assistant

| Field | User Message | Assistant Message |
|-------|--------------|-------------------|
| Model info | `model.modelID` (nested) | `modelID` (flat) |
| Provider | `model.providerID` (nested) | `providerID` (flat) |
| Parent link | N/A | `parentID` links to user message |
| Tokens/cost | N/A | `tokens`, `cost` fields |
| Path info | N/A | `path.cwd`, `path.root` |

---

## 3. Part Types Reference

Parts are emitted via `message.part.updated` events. Each part represents a discrete unit of content within a message.

### Base Part Structure

All parts share these fields:
```typescript
{
  id: string,            // Part ID (e.g., "prt_b38d17f29001...")
  sessionID: string,     // Parent session ID
  messageID: string,     // Parent message ID
  type: string,          // Part type discriminator
  metadata?: Record<string, unknown>  // Optional custom data
}
```

### Part Type: `text`

Text content from the assistant.

```typescript
{
  type: "text",
  text: string,          // Full accumulated text content
  time?: {
    start: number,       // When streaming began
    end?: number         // When streaming completed
  },
  synthetic?: boolean,   // AI-generated vs user input
  ignored?: boolean      // Part should be ignored
}

// In the event properties (NOT in the part):
{
  delta: string          // Incremental content for this update
}
```

**Key insight**: `part.text` contains the FULL accumulated text. `properties.delta` contains only the new increment.

### Part Type: `reasoning`

Extended thinking/reasoning content.

```typescript
{
  type: "reasoning",
  text: string,          // Full accumulated reasoning content
  time: {
    start: number,
    end?: number
  }
}

// In properties:
{
  delta: string          // Incremental reasoning content
}
```

### Part Type: `tool`

Tool invocation and execution.

```typescript
{
  type: "tool",
  callID: string,        // Unique tool invocation ID (e.g., "call_499d379c...")
  tool: string,          // Tool name ("read", "write", "task", etc.)
  state: ToolState       // Current execution state (see Section 4)
}
```

### Part Type: `step-start`

Marks the beginning of an agentic iteration.

```typescript
{
  type: "step-start",
  snapshot?: string      // SHA hash of workspace state
}
```

### Part Type: `step-finish`

Marks the end of an agentic iteration.

```typescript
{
  type: "step-finish",
  reason: string,        // Why iteration finished: "tool-calls" | "stop"
  snapshot?: string,     // Final state snapshot
  cost: number,          // Cost for this step
  tokens: {
    input: number,
    output: number,
    reasoning: number,
    cache: {
      read: number,
      write: number
    }
  }
}
```

### Part Type: `agent`

Indicates which agent is active.

```typescript
{
  type: "agent",
  name: string,          // Agent name
  source?: {
    value: string,       // Agent definition
    start: number,
    end: number
  }
}
```

### Part Type: `subtask`

Represents delegated subagent work.

```typescript
{
  type: "subtask",
  prompt: string,        // Task prompt
  description: string,   // Human-readable description
  agent: string          // Subagent name
}
```

### Part Type: `file`

File reference or attachment.

```typescript
{
  type: "file",
  mime: string,          // MIME type
  filename?: string,     // Original filename
  url: string,           // File location/reference
  source?: {
    type: "file" | "symbol",
    path: string,
    text: {
      value: string,     // Content snippet
      start: number,
      end: number
    },
    // For symbol sources:
    range?: Range,
    name?: string,       // Symbol name
    kind?: number        // LSP symbol kind
  }
}
```

### Part Type: `retry`

Retry attempt after an error.

```typescript
{
  type: "retry",
  attempt: number,       // Attempt number
  error: ApiError,       // Previous error
  time: {
    created: number
  }
}
```

### Part Type: `snapshot`

Session state snapshot.

```typescript
{
  type: "snapshot",
  snapshot: string       // Serialized state
}
```

### Part Type: `patch`

Code changes.

```typescript
{
  type: "patch",
  hash: string,          // Content hash
  files: string[]        // Affected file paths
}
```

### Part Type: `compaction`

Message compaction event.

```typescript
{
  type: "compaction",
  auto: boolean          // Auto vs manual compaction
}
```

---

## 4. Tool State Machine

Tools follow a strict state machine progression. The `state` field on tool parts evolves through these states.

### State Diagram

```
┌─────────┐      ┌─────────┐      ┌───────────┐
│ pending │ ───► │ running │ ───► │ completed │
└─────────┘      └─────────┘      └───────────┘
                      │
                      ▼
                 ┌─────────┐
                 │  error  │
                 └─────────┘
```

### State: `pending`

Tool use created, awaiting execution.

```typescript
{
  status: "pending",
  input: Record<string, unknown>,  // Tool input (may be empty initially)
  raw: string                      // Raw input before parsing
}
```

### State: `running`

Tool currently executing.

```typescript
{
  status: "running",
  input: Record<string, unknown>,  // Parsed tool input
  title?: string,                  // Display title
  metadata?: Record<string, unknown>,  // Custom metadata
  time: {
    start: number                  // Execution start timestamp
  }
}
```

### State: `completed`

Tool finished successfully.

```typescript
{
  status: "completed",
  input: Record<string, unknown>,
  output: string,                  // Tool result/output
  title: string,                   // Display title
  metadata: Record<string, unknown>,
  time: {
    start: number,
    end: number,                   // Completion timestamp
    compacted?: number             // When data was compacted
  },
  attachments?: FilePart[]         // Associated files
}
```

### State: `error`

Tool execution failed.

```typescript
{
  status: "error",
  input: Record<string, unknown>,
  error: string,                   // Error message
  metadata?: Record<string, unknown>,
  time: {
    start: number,
    end: number
  }
}
```

### Fields by State Summary

| State | status | input | output | error | title | metadata | time.start | time.end |
|-------|--------|-------|--------|-------|-------|----------|------------|----------|
| pending | "pending" | Partial/empty | - | - | - | - | - | - |
| running | "running" | Full | - | - | Optional | Optional | Required | - |
| completed | "completed" | Full | Required | - | Required | Required | Required | Required |
| error | "error" | Full | - | Required | - | Optional | Required | Required |

---

## 5. Task Tool / Subagent Specifics

The `task` tool is special - it spawns subagent sessions. Its structure differs from regular tools.

### Task Tool Input

```typescript
// state.input for task tool
{
  description: string,     // Short description (3-5 words)
  prompt: string,          // Full task prompt
  subagent_type: string    // Subagent type (e.g., "general", "Explore", "Plan")
}
```

### Task Tool Metadata Evolution

The `metadata` field evolves as the subagent executes:

**Running (early):**
```typescript
{
  metadata: {
    sessionId: string      // Subagent's session ID (e.g., "ses_4c72e7b62ffe...")
  }
}
```

**Running (with progress):**
```typescript
{
  metadata: {
    sessionId: string,
    summary: Part[]        // Nested parts from subagent's conversation
  }
}
```

**Completed:**
```typescript
{
  status: "completed",
  output: string,          // Final result from subagent
  metadata: {
    sessionId: string,
    summary: Part[]        // Complete summary of subagent's work
  }
}
```

### Session Creation for Subagents

When a task tool runs, a new session is created:

```typescript
// Event: session.created
{
  type: "session.created",
  properties: {
    info: {
      id: string,              // Subagent session ID (matches metadata.sessionId)
      parentID: string,        // Parent session ID (main session)
      title: string,           // e.g., "Load Test Skill (@general subagent)"
      version: string,
      projectID: string,
      directory: string,
      time: {
        created: number,
        updated: number
      }
    }
  }
}
```

### Parent-Child Relationship

```
Main Session (ses_019b38d16719...)
    │
    ├── message.updated (role=assistant)
    │       │
    │       └── message.part.updated (type=tool, tool=task)
    │               │
    │               └── state.metadata.sessionId = "ses_4c72e7b62ffe..."
    │
    └── [linked to]
            │
            ▼
        Subagent Session (ses_4c72e7b62ffe...)
            │
            └── Has its own messages and parts
```

---

## 6. Session Lifecycle

Sessions track the state of a conversation. They have their own state machine.

### Session Status State Machine

```
     ┌──────────────────┐
     │                  │
     ▼                  │
┌─────────┐      ┌─────────┐
│  idle   │ ◄──► │  busy   │
└─────────┘      └─────────┘
     │
     ▼
┌─────────┐
│  retry  │ ────► busy
└─────────┘
```

### Session Status Types

**Idle:**
```typescript
{
  type: "idle"
}
```

**Busy:**
```typescript
{
  type: "busy"
}
```

**Retry:**
```typescript
{
  type: "retry",
  attempt: number,         // Attempt number
  message: string,         // Error description
  next: number             // Next retry timestamp (ms)
}
```

### Session Events Sequence

```
session.created          ─► New session initialized
    │
    ▼
session.status (busy)    ─► Processing user input
    │
    ▼
message.updated          ─► User message created
    │
    ▼
message.updated          ─► Assistant message created
    │
    ▼
message.part.updated     ─► (repeated for each part)
    │
    ▼
session.status (idle)    ─► Processing complete
    │
    ▼
session.idle             ─► Ready for next input
```

### Session Object Structure

```typescript
{
  id: string,
  projectID: string,
  directory: string,
  parentID?: string,       // Parent session (for subagents)
  title: string,
  version: string,
  time: {
    created: number,
    updated: number,
    compacting?: number,
    archived?: number
  },
  summary?: {
    additions: number,
    deletions: number,
    files: number,
    diffs?: FileDiff[]
  },
  share?: {
    url: string
  },
  revert?: {
    messageID: string,
    partID?: string,
    snapshot?: string,
    diff?: string
  }
}
```

---

## 7. ID Relationships

OpenCode uses several ID types to link entities together.

### ID Patterns

| ID Type | Prefix | Example | Purpose |
|---------|--------|---------|---------|
| Session ID | `ses_` | `ses_019b38d16719_9fwj8902kdq` | Identifies a session |
| Message ID | `msg_` | `msg_b38d16ed7001NqDKnVK90yFslb` | Identifies a message |
| Part ID | `prt_` | `prt_b38d17f29001lBPezCGXBXKxay` | Identifies a part |
| Call ID | `call_` | `call_499d379c3296400fbf595aaa` | Identifies a tool invocation |

### Relationship Diagram

```
Session (ses_...)
    │
    ├── parentID ────────────────► Parent Session (for subagents)
    │
    └── Contains Messages
            │
            Message (msg_...)
                │
                ├── sessionID ───► Session
                │
                ├── parentID ────► Parent Message (user msg for assistant)
                │
                └── Contains Parts
                        │
                        Part (prt_...)
                            │
                            ├── sessionID ───► Session
                            │
                            ├── messageID ───► Message
                            │
                            └── callID ──────► Tool invocation (for tool parts)
```

### How IDs Link Together

1. **Part → Message**: `part.messageID` links to `message.id`
2. **Part → Session**: `part.sessionID` links to `session.id`
3. **Message → Session**: `message.sessionID` links to `session.id`
4. **Assistant → User**: `assistantMessage.parentID` links to `userMessage.id`
5. **Subagent → Parent**: `subagentSession.parentID` links to `mainSession.id`
6. **Task Tool → Subagent**: `taskTool.state.metadata.sessionId` links to subagent `session.id`

---

## 8. Real Examples

### Example 1: User Message Event

```json
{
  "type": "message.updated",
  "properties": {
    "info": {
      "id": "msg_b38d16ed7001NqDKnVK90yFslb",
      "sessionID": "ses_019b38d16719_9fwj8902kdq",
      "role": "user",
      "time": {
        "created": 1766184808151
      },
      "agent": "build",
      "model": {
        "providerID": "opencode",
        "modelID": "big-pickle"
      }
    }
  }
}
```

### Example 2: Assistant Message Event

```json
{
  "type": "message.updated",
  "properties": {
    "info": {
      "id": "msg_b38d16ef6001rSYZZC3WE7AbSD",
      "sessionID": "ses_019b38d16719_9fwj8902kdq",
      "role": "assistant",
      "time": {
        "created": 1766184808182
      },
      "parentID": "msg_b38d16ed7001NqDKnVK90yFslb",
      "modelID": "big-pickle",
      "providerID": "opencode",
      "mode": "build",
      "agent": "build",
      "path": {
        "cwd": "/Users/hunterhopkins/dev/projects/ai-systems/runtime/runner/test/test-workspace/workspace",
        "root": "/Users/hunterhopkins/dev/projects/ai-systems"
      },
      "cost": 0,
      "tokens": {
        "input": 0,
        "output": 0,
        "reasoning": 0,
        "cache": {
          "read": 0,
          "write": 0
        }
      }
    }
  }
}
```

### Example 3: Text Part with Delta

```json
{
  "type": "message.part.updated",
  "properties": {
    "part": {
      "id": "prt_b38d17f2b001cbAlnwoD0Ft0mP",
      "sessionID": "ses_019b38d16719_9fwj8902kdq",
      "messageID": "msg_b38d16ef6001rSYZZC3WE7AbSD",
      "type": "text",
      "text": "Hello, I can help you with that.",
      "time": {
        "start": 1766184812331
      }
    },
    "delta": " that."
  }
}
```

### Example 4: Tool Part - Pending

```json
{
  "type": "message.part.updated",
  "properties": {
    "part": {
      "id": "prt_b38d180e0001W4W9uXxEO9UVu3",
      "sessionID": "ses_019b38d16719_9fwj8902kdq",
      "messageID": "msg_b38d16ef6001rSYZZC3WE7AbSD",
      "type": "tool",
      "callID": "call_499d379c3296400fbf595aaa",
      "tool": "task",
      "state": {
        "status": "pending",
        "input": {},
        "raw": ""
      }
    }
  }
}
```

### Example 5: Tool Part - Running (Task Tool)

```json
{
  "type": "message.part.updated",
  "properties": {
    "part": {
      "id": "prt_b38d180e0001W4W9uXxEO9UVu3",
      "sessionID": "ses_019b38d16719_9fwj8902kdq",
      "messageID": "msg_b38d16ef6001rSYZZC3WE7AbSD",
      "type": "tool",
      "callID": "call_499d379c3296400fbf595aaa",
      "tool": "task",
      "state": {
        "status": "running",
        "input": {
          "description": "Load Test Skill",
          "prompt": "skills_test",
          "subagent_type": "general"
        },
        "title": "Load Test Skill",
        "metadata": {
          "sessionId": "ses_4c72e7b62ffeN60u5X8Jv0Rck7"
        },
        "time": {
          "start": 1766184813727
        }
      }
    }
  }
}
```

### Example 6: Tool Part - Running with Summary

```json
{
  "type": "message.part.updated",
  "properties": {
    "part": {
      "type": "tool",
      "tool": "task",
      "callID": "call_499d379c3296400fbf595aaa",
      "state": {
        "status": "running",
        "input": {
          "description": "Load Test Skill",
          "prompt": "skills_test",
          "subagent_type": "general"
        },
        "title": "Load Test Skill",
        "metadata": {
          "sessionId": "ses_4c72e7b62ffeN60u5X8Jv0Rck7",
          "summary": [
            {
              "id": "prt_b38d1907d0015fGzOb9uaKy1l0",
              "type": "tool",
              "tool": "testTool",
              "state": {
                "status": "running"
              }
            }
          ]
        },
        "time": {
          "start": 1766184816768
        }
      }
    }
  }
}
```

### Example 7: Tool Part - Completed (Regular Tool)

```json
{
  "type": "message.part.updated",
  "properties": {
    "part": {
      "id": "prt_b38d190f5001ZpSXSdIFEQxHPi",
      "sessionID": "ses_4c72e7b62ffeN60u5X8Jv0Rck7",
      "messageID": "msg_b38d18fea0014NJKEvBhMWNSjQ",
      "type": "tool",
      "callID": "call_63ccad8abe1f47f1a8d5c9b5",
      "tool": "testTool",
      "state": {
        "status": "completed",
        "input": {},
        "output": "Pickles from /Users/hunterhopkins/dev/projects/ai-systems/.opencode/plugin",
        "title": "",
        "metadata": {},
        "time": {
          "start": 1766184816767,
          "end": 1766184816767
        }
      }
    }
  }
}
```

### Example 8: Tool Part - Error

```json
{
  "type": "message.part.updated",
  "properties": {
    "part": {
      "id": "prt_b38d1c51f001W6lWVJcOz8tMnP",
      "sessionID": "ses_4c72e7b62ffeN60u5X8Jv0Rck7",
      "messageID": "msg_b38d1be5f001VQ6qBHvLlWcBPD",
      "type": "tool",
      "callID": "call_8b3e12fcda784b0aa1d2c3e4",
      "tool": "write",
      "state": {
        "status": "error",
        "input": {
          "content": "Hello world from the subagent!",
          "filePath": "/path/to/file.txt"
        },
        "error": "Error: You must read the file first before overwriting it.",
        "time": {
          "start": 1766184839023,
          "end": 1766184839025
        }
      }
    }
  }
}
```

### Example 9: Step Start/Finish

```json
// Step Start
{
  "type": "message.part.updated",
  "properties": {
    "part": {
      "id": "prt_b38d17f29001lBPezCGXBXKxay",
      "sessionID": "ses_019b38d16719_9fwj8902kdq",
      "messageID": "msg_b38d16ef6001rSYZZC3WE7AbSD",
      "type": "step-start",
      "snapshot": "3a385933909cd19f2ae82e78dbb018a2965e95a5"
    }
  }
}

// Step Finish
{
  "type": "message.part.updated",
  "properties": {
    "part": {
      "id": "prt_b38d180c8001sLOzX8FS75ePQe",
      "sessionID": "ses_019b38d16719_9fwj8902kdq",
      "messageID": "msg_b38d16ef6001rSYZZC3WE7AbSD",
      "type": "step-finish",
      "reason": "tool-calls",
      "snapshot": "3a385933909cd19f2ae82e78dbb018a2965e95a5",
      "cost": 0,
      "tokens": {
        "input": 10851,
        "output": 10,
        "reasoning": 0,
        "cache": {
          "read": 72,
          "write": 0
        }
      }
    }
  }
}
```

### Example 10: Session Idle

```json
{
  "type": "session.idle",
  "properties": {
    "sessionID": "ses_4c72e7b62ffeN60u5X8Jv0Rck7"
  }
}
```

### Example 11: Session Status

```json
{
  "type": "session.status",
  "properties": {
    "sessionID": "ses_019b38d16719_9fwj8902kdq",
    "status": {
      "type": "busy"
    }
  }
}
```

### Example 12: Subagent Session Created

```json
{
  "type": "session.created",
  "properties": {
    "info": {
      "id": "ses_4c72e7b62ffeN60u5X8Jv0Rck7",
      "version": "1.0.163",
      "projectID": "817676e87c69179d75ad3800e636528aca8581b0",
      "directory": "/Users/hunterhopkins/dev/projects/ai-systems/runtime/runner/test/test-workspace/workspace",
      "parentID": "ses_019b38d16719_9fwj8902kdq",
      "title": "Load Test Skill (@general subagent)",
      "time": {
        "created": 1766184813726,
        "updated": 1766184813726
      }
    }
  }
}
```

---

## Quick Reference Card

### Common Field Locations

| Data | Location |
|------|----------|
| Event type | `event.type` |
| Message ID | `event.properties.info.id` |
| Message role | `event.properties.info.role` |
| Part ID | `event.properties.part.id` |
| Part type | `event.properties.part.type` |
| Part message ID | `event.properties.part.messageID` |
| Text delta | `event.properties.delta` (NOT in part) |
| Text content | `event.properties.part.text` |
| Tool name | `event.properties.part.tool` |
| Tool call ID | `event.properties.part.callID` |
| Tool status | `event.properties.part.state.status` |
| Tool input | `event.properties.part.state.input` |
| Tool output | `event.properties.part.state.output` |
| Tool error | `event.properties.part.state.error` |
| Subagent session | `event.properties.part.state.metadata.sessionId` |
| Subagent summary | `event.properties.part.state.metadata.summary` |

### Status Values

| Context | Values |
|---------|--------|
| Tool state | `"pending"`, `"running"`, `"completed"`, `"error"` |
| Session status | `{ type: "idle" }`, `{ type: "busy" }`, `{ type: "retry", ... }` |
| Step finish reason | `"tool-calls"`, `"stop"` |

### Time Fields

All timestamps are **Unix milliseconds**.

| Field | Context |
|-------|---------|
| `time.created` | When entity was created |
| `time.start` | When execution/streaming began |
| `time.end` | When execution/streaming completed |
| `time.completed` | When message finished (on messages) |
| `time.updated` | When entity was last updated (sessions) |
