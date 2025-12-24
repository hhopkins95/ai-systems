/**
 * @ai-systems/shared-types
 *
 * Shared TypeScript types for Claude Code entities, plugins, and agent contexts.
 * Used across the ai-systems monorepo for consistent type definitions.
 */

// Source tracking
export * from "./agents/sources.js";

// Plugin types
export * from "./agents/plugin.js";

// MCP types
export * from "./agents/entities/mcp.js";

// Entity types
export * from "./agents/entities/index.js";

// Agent context (composed type)
export * from "./agents/agent-context.js";


// Transcript types (for converter packages)
export * from "./agent-architectures/transcript.js";

// Config files
export * from "./agent-architectures/config-files/claude.js";
export * from "./agent-architectures/config-files/opencode.js";