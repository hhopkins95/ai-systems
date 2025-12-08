/**
 * esbuild configuration for agent-runner
 *
 * Bundles CLI scripts into self-contained executables for sandbox deployment.
 * All dependencies are bundled (no externals) to ensure the bundle works
 * in isolated environments without access to node_modules.
 */

import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isWatch = process.argv.includes('--watch');

/**
 * Common build options for all entry points
 */
const commonOptions: esbuild.BuildOptions = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  sourcemap: true,
  minify: false, // Keep readable for debugging in sandbox
  // Bundle EVERYTHING - no externals for self-contained deployment
  external: [],
  // Handle Node.js built-ins
  define: {
    'import.meta.url': 'import.meta.url',
  },
  // Resolve workspace packages
  alias: {
    '@ai-systems/shared-types': join(__dirname, '../../packages/types/src/index.ts'),
    '@hhopkins/agent-converters': join(__dirname, '../../packages/converters/src/index.ts'),
    '@hhopkins/claude-entity-manager': join(__dirname, '../../packages/claude-entity-manager/src/index.ts'),
  },
};

/**
 * CLI entry points (with shebang banner for executable scripts)
 */
const cliEntryPoints = [
  {
    input: join(__dirname, 'src/cli/execute-query.ts'),
    output: join(__dirname, 'dist/execute-query.js'),
  },
  {
    input: join(__dirname, 'src/cli/setup-session.ts'),
    output: join(__dirname, 'dist/setup-session.js'),
  },
];

/**
 * Library entry point (no shebang)
 */
const libEntryPoint = {
  input: join(__dirname, 'src/index.ts'),
  output: join(__dirname, 'dist/index.js'),
};

async function build() {
  console.log('Building agent-runner bundles...');

  // Build CLI scripts with shebang banner
  for (const entry of cliEntryPoints) {
    console.log(`  Building ${entry.output}...`);
    await esbuild.build({
      ...commonOptions,
      entryPoints: [entry.input],
      outfile: entry.output,
      banner: {
        js: '#!/usr/bin/env node',
      },
    });
  }

  // Build library entry point (no shebang)
  console.log(`  Building ${libEntryPoint.output}...`);
  await esbuild.build({
    ...commonOptions,
    entryPoints: [libEntryPoint.input],
    outfile: libEntryPoint.output,
  });

  console.log('Build complete!');
}

async function watch() {
  console.log('Watching for changes...');

  // Create contexts for CLI scripts (with shebang)
  const cliContexts = await Promise.all(
    cliEntryPoints.map((entry) =>
      esbuild.context({
        ...commonOptions,
        entryPoints: [entry.input],
        outfile: entry.output,
        banner: {
          js: '#!/usr/bin/env node',
        },
      })
    )
  );

  // Create context for library entry point (no shebang)
  const libContext = await esbuild.context({
    ...commonOptions,
    entryPoints: [libEntryPoint.input],
    outfile: libEntryPoint.output,
  });

  await Promise.all([...cliContexts, libContext].map((ctx) => ctx.watch()));

  console.log('Watching for changes... Press Ctrl+C to stop.');
}

if (isWatch) {
  watch().catch((error) => {
    console.error('Watch failed:', error);
    process.exit(1);
  });
} else {
  build().catch((error) => {
    console.error('Build failed:', error);
    process.exit(1);
  });
}
