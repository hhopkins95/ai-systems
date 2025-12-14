# Implementation Plan: Session Folder Consolidation

## Overview

Refactor session path management to use a single `SESSION_DIR` with convention-based subdirectories, and set `CLAUDE_CONFIG_DIR` per-session to isolate Claude's configuration.

---

## Change Summary by Layer

### Layer 1: Interface Definition
- `base.ts` - Simplify `getBasePaths()` return type

### Layer 2: Primitives (3 files)
- `local/index.ts` - Update directory creation, add CLAUDE_CONFIG_DIR to env
- `docker/index.ts` - Update mounts, container paths, env vars
- `modal/index.ts` - Update fixed paths, env vars

### Layer 3: Execution Environment
- `execution-environment.ts` - Add path derivation helper, update all path usages

### Layer 4: Runner (transcript handling)
- `getClaudeTranscriptDir.ts` - Use CLAUDE_CONFIG_DIR env var instead of os.homedir()
- Possibly other transcript files if they hardcode paths

### Layer 5: Configuration
- Type definitions for new options

---

## Detailed Changes

### 1. `base.ts` - Interface Definition

**File:** `runtime/server/src/lib/environment-primitives/base.ts`

**Current:**
```typescript
getBasePaths: () => {
    APP_DIR: string,
    WORKSPACE_DIR: string,
    HOME_DIR: string,
    BUNDLED_MCP_DIR: string,
}
```

**New:**
```typescript
getBasePaths: () => {
    SESSION_DIR: string,  // Root of session folder
}
```

**Add helper type/function for path derivation:**
```typescript
export interface DerivedPaths {
    sessionDir: string;
    appDir: string;
    workspaceDir: string;
    mcpDir: string;
    claudeConfigDir: string;
}

export function deriveSessionPaths(sessionDir: string): DerivedPaths {
    return {
        sessionDir,
        appDir: join(sessionDir, 'app'),
        workspaceDir: join(sessionDir, 'workspace'),
        mcpDir: join(sessionDir, 'mcps'),
        claudeConfigDir: join(sessionDir, '.claude'),
    };
}
```

---

### 2. `local/index.ts` - LocalPrimitive

**File:** `runtime/server/src/lib/environment-primitives/local/index.ts`

**Changes:**

1. **Directory creation** (lines 28-51):
   - Create only: `{sessionsDir}/{sessionId}/`
   - Subdirs created on-demand or by ExecutionEnvironment

2. **getBasePaths()** return:
   ```typescript
   return { SESSION_DIR: this.sessionPath }
   ```

3. **exec() environment** (lines 86-92):
   ```typescript
   const paths = deriveSessionPaths(this.sessionPath);
   const child = spawn(cmd, args, {
       cwd: options?.cwd || paths.workspaceDir,
       env: {
           ...process.env,
           CLAUDE_CONFIG_DIR: paths.claudeConfigDir,
           // Remove HOME override, or keep if needed for other tools
       },
   });
   ```

4. **Remove** references to `HOME_DIR` in basePaths

---

### 3. `docker/index.ts` - DockerPrimitive

**File:** `runtime/server/src/lib/environment-primitives/docker/index.ts`

**Changes:**

1. **Host directory creation**:
   - Create only: `{sessionsDir}/{containerId}/`
   - Return `SESSION_DIR` only

2. **Container path constants** - new mapping:
   ```typescript
   const CONTAINER_SESSION_ROOT = '/session';
   const CONTAINER_PATHS = {
       app: '/session/app',
       workspace: '/session/workspace',
       mcps: '/session/mcps',
       claudeConfig: '/session/.claude',
   };
   ```

3. **Volume mounts** (container.ts):
   ```typescript
   `-v ${hostSessionDir}/app:${CONTAINER_PATHS.app}`,
   `-v ${hostSessionDir}/workspace:${CONTAINER_PATHS.workspace}`,
   `-v ${hostSessionDir}/mcps:${CONTAINER_PATHS.mcps}`,
   `-v ${hostSessionDir}/.claude:${CONTAINER_PATHS.claudeConfig}`,
   ```

4. **Environment variables** in container:
   ```typescript
   `-e CLAUDE_CONFIG_DIR=${CONTAINER_PATHS.claudeConfig}`,
   // Remove HOME=/root override, or set HOME=/session if needed
   ```

5. **hostPath() method** - update mappings:
   ```typescript
   hostPath(containerPath: string): string {
       // Map /session/* back to host paths
       if (containerPath.startsWith('/session/')) {
           return join(this.hostSessionDir, containerPath.slice('/session/'.length));
       }
       return join(this.hostSessionDir, 'workspace', containerPath);
   }
   ```

---

### 4. `modal/index.ts` - ModalSandbox

**File:** `runtime/server/src/lib/environment-primitives/modal/index.ts`

**Changes:**

1. **Fixed paths** - update to new structure:
   ```typescript
   const MODAL_PATHS = {
       SESSION_DIR: '/session',
       // Derived:
       app: '/session/app',
       workspace: '/session/workspace',
       mcps: '/session/mcps',
       claudeConfig: '/session/.claude',
   };
   ```

2. **getBasePaths():**
   ```typescript
   return { SESSION_DIR: MODAL_PATHS.SESSION_DIR }
   ```

3. **Environment in sandbox creation** (`create-sandbox.ts`):
   ```typescript
   env: {
       ANTHROPIC_API_KEY: apiKey,
       CLAUDE_CONFIG_DIR: '/session/.claude',
       CLAUDE_CODE_CWD: '/session/workspace',
       // ... other vars
   }
   ```

---

### 5. `execution-environment.ts` - Path Consumption

**File:** `runtime/server/src/core/execution-environment.ts`

**Changes:**

1. **Add derived paths property:**
   ```typescript
   private paths: DerivedPaths;

   // In create():
   const { SESSION_DIR } = primitive.getBasePaths();
   this.paths = deriveSessionPaths(SESSION_DIR);
   ```

2. **Create subdirectories on init:**
   ```typescript
   await Promise.all([
       primitive.createDirectory(this.paths.appDir),
       primitive.createDirectory(this.paths.workspaceDir),
       primitive.createDirectory(this.paths.mcpDir),
       primitive.createDirectory(this.paths.claudeConfigDir),
   ]);
   ```

3. **Update all path references:**
   - `APP_DIR` → `this.paths.appDir`
   - `WORKSPACE_DIR` → `this.paths.workspaceDir`
   - `BUNDLED_MCP_DIR` → `this.paths.mcpDir`
   - Remove `HOME_DIR` references

4. **Expose paths via getter:**
   ```typescript
   getBasePaths() {
       return this.paths;
   }
   ```

---

### 6. `getClaudeTranscriptDir.ts` - Transcript Directory

**File:** `runtime/runner/src/helpers/getClaudeTranscriptDir.ts`

**Current:**
```typescript
const homeDir = os.homedir()
const transcriptDir = join(homeDir, '.claude', 'projects', projectId);
```

**New:**
```typescript
export const getClaudeTranscriptDir = async (projectDir: string): Promise<string> => {
    // Use CLAUDE_CONFIG_DIR if set, otherwise fall back to home
    const claudeConfigDir = process.env.CLAUDE_CONFIG_DIR || join(os.homedir(), '.claude');
    const projectId = projectDir.replace('/', '-').replace(' ', '-');
    const transcriptDir = join(claudeConfigDir, 'projects', projectId);
    await mkdir(transcriptDir, { recursive: true });
    return transcriptDir;
}
```

This makes the runner respect `CLAUDE_CONFIG_DIR` when set, automatically putting transcripts in the session's `.claude/` folder.

---

### 7. `execute-claude-query.ts` - Session Lookup

**File:** `runtime/runner/src/core/execute-claude-query.ts`

**Check lines 21-40** - if it uses `process.env.HOME` or `os.homedir()` for Claude session lookup, update to use `CLAUDE_CONFIG_DIR`:

```typescript
const claudeConfigDir = process.env.CLAUDE_CONFIG_DIR || join(os.homedir(), '.claude');
// Use claudeConfigDir instead of hardcoded ~/.claude
```

---

### 8. Type Definitions

**File:** `runtime/server/src/types/execution-environment.ts`

Update any types that reference the old path structure. The options types should be fine since they just pass `sessionsDirectoryPath`.

---

## Migration Notes

### Backwards Compatibility
- **Not needed** - `.agent-sessions/` is ephemeral
- Old sessions can be deleted
- No database/persistence to migrate

### Testing Checklist
- [ ] Local execution creates correct folder structure
- [ ] Local execution sets CLAUDE_CONFIG_DIR in spawned processes
- [ ] Claude transcripts appear in `{session}/.claude/projects/`
- [ ] Docker mounts work with new paths
- [ ] Docker container has CLAUDE_CONFIG_DIR set
- [ ] Modal sandbox has correct paths and env vars
- [ ] File watching still works on workspace
- [ ] Agent profile loading still works (`workspace/.claude/`)

---

## Implementation Order

1. **Start with types/interface** - Update `base.ts` with new interface + helper
2. **Update LocalPrimitive** - Easiest to test locally
3. **Update ExecutionEnvironment** - Path derivation logic
4. **Update runner transcript handling** - Use CLAUDE_CONFIG_DIR
5. **Test local end-to-end** - Verify transcripts in session folder
6. **Update DockerPrimitive** - More complex due to mounts
7. **Update ModalSandbox** - Similar to Docker
8. **Final integration testing**

---

## Open Questions Resolved

| Question | Decision |
|----------|----------|
| Keep `home/` directory? | No - CLAUDE_CONFIG_DIR is sufficient for Claude isolation. If other tools need HOME, we can revisit. |
| What goes in `.opencode/`? | Defer for now - focus on `.claude/` first. Can add `.opencode/` later if needed. |
| Container paths? | Use `/session` as root with subdirs |
| Backwards compat? | Not needed - sessions are ephemeral |
