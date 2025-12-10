# Getting Started

Set up the ai-systems monorepo and run your first agent.

## Prerequisites

- Node.js >= 20
- pnpm >= 9
- Modal account (for sandbox execution)

## Steps

### 1. Install Dependencies

```bash
cd ai-systems
pnpm install
```

### 2. Build All Packages

```bash
pnpm build
```

Build output goes to `dist/` in each package.

### 3. Set Up Environment

Create `.env` files for packages that need secrets:

```bash
# runtime/server/.env
MODAL_TOKEN_ID=your-modal-token-id
MODAL_TOKEN_SECRET=your-modal-token-secret
```

### 4. Run the Examples

Start the example backend:

```bash
cd apps/example-backend
pnpm dev
```

In another terminal, start the example frontend:

```bash
cd apps/example-frontend
pnpm dev
```

Open `http://localhost:3004` to interact with the agent.

## Verification

Confirm everything works:

```bash
# Check builds pass
pnpm build

# Check types pass
pnpm typecheck

# Backend health check
curl http://localhost:3001/health
```

Expected output for health check:
```json
{"status":"ok"}
```

## Project Structure

```
ai-systems/
├── runtime/
│   ├── server/     # @hhopkins/agent-server - Orchestration
│   ├── client/     # @hhopkins/agent-client - React hooks
│   └── runner/     # @hhopkins/agent-runner - Sandbox execution
├── packages/
│   ├── converters/ # @hhopkins/agent-converters - Transcript parsing
│   ├── claude-entity-manager/  # Entity discovery
│   ├── types/      # @ai-systems/shared-types
│   └── opencode-claude-adapter/
├── apps/
│   ├── example-backend/   # Reference server
│   ├── example-frontend/  # Reference React app
│   └── smart-docs/        # Documentation viewer
└── plugins/
    └── smart-docs-authoring/  # Documentation standards
```

## Common Issues

### Modal Connection Fails

**Symptom:** "Modal authentication failed"
**Cause:** Missing or invalid Modal tokens
**Fix:** Ensure `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` are set correctly

### Build Fails

**Symptom:** TypeScript errors during build
**Cause:** Missing dependencies or stale builds
**Fix:** Run `pnpm install && pnpm build` from root

### Port Already in Use

**Symptom:** "EADDRINUSE" error
**Cause:** Another process using the port
**Fix:** Kill the process or use a different port via `PORT=3002 pnpm dev`

## Next Steps

- [Architecture Overview](../system/architecture-overview.md) - Understand the system
- [agent-server](../packages/agent-server.md) - Configure the runtime
- [agent-client](../packages/agent-client.md) - Build your UI
