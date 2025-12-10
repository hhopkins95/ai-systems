---
title: Runtime Pass-Through Server
created: 2025-12-10
status: backlog
---

# Runtime Pass-Through Server

## Goal

Add a convenience pass-through server to the runtime that provides access to sessions and other resources exposed via the persistence adapter. This allows calling applications to consume session data without needing to create those routes themselves.

## Scope

**In scope:**
- Pass-through API routes for session access
- Exposing persistence adapter data via the runtime
- Standard REST endpoints for common operations

**Out of scope:**
- Custom business logic in the pass-through layer
- Authentication/authorization (handled by calling app)

## Completion Criteria

- [ ] Pass-through server implementation in runtime
- [ ] Routes for session CRUD operations
- [ ] Routes for other persistence adapter resources
- [ ] Integration tested with existing persistence adapters
- [ ] Documentation updated

## Current Status

Not started - in backlog.

## Quick Links

- [Sessions](sessions/)
