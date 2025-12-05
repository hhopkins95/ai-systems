---
title: "@hhopkins/smart-docs"
description: A local documentation viewer for AI-native codebases
---

# Smart Docs

A local documentation viewer for AI-native codebases that unifies your project documentation with Claude Code configuration and plugin management.

## Purpose

Smart Docs solves the problem of scattered AI-native documentation by providing a single, clean interface to view:

- **Your project documentation** - Markdown files from your docs folder
- **Claude Code configuration** - Skills, commands, agents, and hooks from both global (`~/.claude`) and project-level (`./.claude`) directories
- **Plugin management** - View all installed plugins and enable/disable them per-project

Instead of building a full documentation app within your project root, just keep a simple `docs/` folder and view everything through Smart Docs.

## Features

- **Single command launch** - `npx smart-docs ./docs` starts a local server and opens your browser
- **Unified view** - See your docs, Claude config, and plugins in one place
- **Live updates** - File changes are reflected immediately (file watching)
- **Plugin management** - Enable/disable global plugins for specific projects
- **Markdown support** - Syntax highlighting, frontmatter parsing, internal links, and Mermaid diagrams
- **Local dev focused** - No deployment needed, runs entirely on your machine

## Installation

```bash
npm install -g smart-docs
```

Or use directly with npx:

```bash
npx smart-docs ./docs
```

## Usage

### Basic usage

From your project root:

```bash
npx smart-docs ./docs
```

This will:
1. Start a local web server
2. Watch your docs folder and `.claude` directories for changes
3. Open your browser to view the documentation

### What it shows

**Docs Tab**
- Browse your markdown documentation
- Nested folder structure support
- Syntax-highlighted code blocks
- Mermaid diagram rendering

**Claude Config Tab**
- **Global**: Skills, commands, agents, hooks from `~/.claude`
- **Project**: Skills, commands, agents, hooks from `./.claude`
- View raw content with syntax highlighting

**Plugins Tab**
- List all installed plugins (global and project-level)
- See plugin metadata (name, version, description, component counts)
- Enable/disable global plugins for the current project
- Auto-creates `.claude/settings.json` if needed

## Architecture

### Tech Stack
- **Next.js 15** with TypeScript and App Router
- **Hono** server for API endpoints (embedded in Next.js)
- **Socket.IO** for live file updates
- **Chokidar** for file watching
- **React Markdown** with plugins for rendering
- **Tailwind CSS** for styling

### How it works

1. **CLI** parses the docs path and sets environment variables
2. **Services** initialize as singletons:
   - File watcher monitors docs, `.claude` folders, and plugins
   - Plugin discovery scans for installed plugins
   - Services read from disk on every request (no caching)
3. **API routes** expose data to the frontend
4. **Socket.IO** broadcasts file changes to connected clients
5. **Frontend** fetches data and updates in real-time

## Configuration

### Plugin Management

Smart Docs reads and writes to `.claude/settings.json` in your project root:

```json
{
  "enabledPlugins": {
    "example-skills@anthropic-agent-skills": true,
    "my-custom-plugin@local": false
  }
}
```

When you toggle a plugin in the UI, Smart Docs updates this file automatically.

### File Watching

Smart Docs watches these locations:
- `<docs-path>/**/*.md` - Your documentation
- `~/.claude/skills/**` - Global skills
- `~/.claude/plugins/**` - Global plugins
- `./.claude/**` - Project-level Claude config
- `./.claude/settings.json` - Plugin states

## License

MIT
