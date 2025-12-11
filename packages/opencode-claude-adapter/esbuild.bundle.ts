/**
 * esbuild configuration for opencode-claude-adapter
 *
 * Builds three outputs:
 * 1. dist/index.js - Bundled plugin (for OpenCode local use)
 * 2. dist/adapter.bundle.js - Same bundle (for Modal sandboxes, read by bundle.js)
 * 3. dist/bundle.js - Bundle utilities (for runtime server)
 */

import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { copyFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Node.js built-in modules that must be external
const nodeBuiltins = [
  'assert', 'buffer', 'child_process', 'cluster', 'crypto', 'dgram', 'dns',
  'domain', 'events', 'fs', 'http', 'https', 'net', 'os', 'path', 'punycode',
  'querystring', 'readline', 'stream', 'string_decoder', 'tls', 'tty', 'url',
  'util', 'v8', 'vm', 'zlib', 'module', 'worker_threads', 'perf_hooks',
  'async_hooks', 'inspector', 'trace_events', 'constants', 'process', 'timers',
];

// Include both bare and node: prefixed versions
const externalModules = [
  ...nodeBuiltins,
  ...nodeBuiltins.map(m => `node:${m}`),
];

async function build() {
  console.log('Building opencode-claude-adapter...');

  // 1. Build the bundled plugin (for OpenCode local use)
  console.log('  → Building index.js (bundled plugin)...');
  await esbuild.build({
    entryPoints: [join(__dirname, 'src/index.ts')],
    outfile: join(__dirname, 'dist/index.js'),
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'esm',
    sourcemap: false,
    minify: false,
    external: externalModules,
    banner: {
      js: `import { createRequire as __createRequire } from 'module';
const require = __createRequire(import.meta.url);`,
    },
    alias: {
      '@ai-systems/shared-types': join(__dirname, '../types/src/index.ts'),
      '@hhopkins/claude-entity-manager': join(__dirname, '../claude-entity-manager/src/index.ts'),
    },
  });

  // 2. Copy to adapter.bundle.js (for runtime server to read)
  console.log('  → Copying to adapter.bundle.js...');
  copyFileSync(
    join(__dirname, 'dist/index.js'),
    join(__dirname, 'dist/adapter.bundle.js')
  );

  // 3. Build the bundle utilities (for runtime server)
  console.log('  → Building bundle.js (bundle utilities)...');
  await esbuild.build({
    entryPoints: [join(__dirname, 'src/bundle.ts')],
    outfile: join(__dirname, 'dist/bundle.js'),
    bundle: false,
    platform: 'node',
    target: 'node18',
    format: 'esm',
    sourcemap: true,
  });

  console.log('Build complete!');
}

build().catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});
