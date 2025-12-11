/**
 * esbuild configuration for opencode-claude-adapter bundle
 *
 * Bundles the adapter + all dependencies into a single file for sandbox deployment.
 * This bundle is written to /app/opencode-adapter/ in Modal sandboxes.
 */

import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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
  console.log('Building opencode-claude-adapter bundle...');

  await esbuild.build({
    entryPoints: [join(__dirname, 'src/index.ts')],
    outfile: join(__dirname, 'dist/bundle.js'),
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'esm',
    sourcemap: false, // Keep bundle small
    minify: false, // Keep readable for debugging
    external: externalModules,
    // Inject createRequire for CJS modules
    banner: {
      js: `import { createRequire as __createRequire } from 'module';
const require = __createRequire(import.meta.url);`,
    },
    // Resolve workspace packages
    alias: {
      '@ai-systems/shared-types': join(__dirname, '../types/src/index.ts'),
      '@hhopkins/claude-entity-manager': join(__dirname, '../claude-entity-manager/src/index.ts'),
    },
  });

  console.log('Bundle complete: dist/bundle.js');
}

build().catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});
