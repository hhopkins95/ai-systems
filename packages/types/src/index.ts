/**
 * @ai-systems/shared-types
 *
 * Shared TypeScript types for Claude Code entities, plugins, and agent contexts.
 * Used across the ai-systems monorepo for consistent type definitions.
 */

// Source tracking
export * from "./sources.js";

// Plugin types
export * from "./plugin.js";

// MCP types
export * from "./entities/mcp.js";

// Entity types
export * from "./entities/index.js";

// Agent context (composed type)
export * from "./agent-context.js";

// Runtime types (blocks, stream events)
export * from "./runtime/index.js";

// Transcript types (for converter packages)
export * from "./transcript.js";

// Config files
export * from "./config-files/claude.js";
export * from "./config-files/opencode.js";