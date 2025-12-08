# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **MCPLoader** - Dedicated loader for MCP server configurations
  - Loads from global `~/.claude/.mcp.json`
  - Loads from project `.claude/.mcp.json`
  - Loads from plugin manifests (`plugin.json` mcpServers field)
  - Loads from plugin `.mcp.json` files at plugin root
  - Source tracking with `McpServerWithSource` type

- **EntityWriter.writeMcpServers()** - Write MCP configurations to `.claude/.mcp.json`
  - Merge support: reads existing config and merges (new servers overwrite by name)
  - Integrated into `writeEntities()` batch method

- **Path utility** - `getMcpConfigPath()` for consistent MCP config file paths

### Changed

- **ClaudeEntityManager.loadAgentContext()** now loads MCP servers from all three sources (global, project, plugin) using the new MCPLoader
- MCP servers in AgentContext now include source tracking via `McpServerWithSource` type

### Internal

- Removed ad-hoc MCP loading from `PluginDiscovery.loadMcpServersFromPlugin()` - now handled by MCPLoader
- MCPLoader follows the same pattern as SkillLoader, CommandLoader, AgentLoader, HookLoader

## [0.2.4] - Previous Release

### Features

- Entity loading from global, project, and plugin sources
- Plugin discovery and management
- Skills, commands, agents, hooks support
- EntityWriter for writing entities to project
- CLAUDE.md memory file loading
