# OpenCode Transcript Subagent Export

Export OpenCode transcripts with complete subagent data, similar to how Claude transcripts handle combined sessions.

## Context

Currently, when OpenCode transcripts are exported, they don't include all of the subagent data. The subagent sessions are stored separately and not bundled with the parent transcript.

**What's needed:**
- Implement a combined transcript type for OpenCode (similar to `CombinedClaudeTranscript`)
- Locate subagent IDs within the parent transcript
- Export those subagent sessions alongside the main transcript
- Bundle everything together for complete transcript export

**Reference:** Look at the Claude transcript implementation for the pattern to follow.

---
*Added: 2025-12-23*
