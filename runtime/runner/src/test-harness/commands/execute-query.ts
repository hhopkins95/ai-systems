/**
 * execute-query command - test the execute-query runner
 */

import { Command } from 'commander';
import type { AgentArchitecture } from '@ai-systems/shared-types';
import type { ExecuteQueryArgs } from '../../types.js';
import { runRunner } from '../lib/process-runner.js';
import { createWorkspace } from '../lib/workspace.js';
import { parseJsonlStream, formatSummary } from '../lib/stream-parser.js';
import { resolveInput, mergeInput } from '../lib/input-resolver.js';
import type { OutputFormat } from '../types.js';

export const executeQueryCommand = new Command('execute-query')
  .description('Execute a query against the agent runner')
  .option('-i, --input <file>', 'Input JSON file')
  .option('--inline <json>', 'Inline JSON input')
  .option('-p, --prompt <text>', 'Query prompt (overrides input)')
  .option('-s, --session-id <id>', 'Session ID')
  .option(
    '-a, --architecture <arch>',
    'Architecture (claude-sdk|opencode)',
    'claude-sdk'
  )
  .option('-w, --workspace <dir>', 'Workspace directory')
  .option('-m, --model <model>', 'Model to use')
  .option(
    '-f, --format <format>',
    'Output format (stream|collect|summary)',
    'stream'
  )
  .option('--filter <type>', 'Filter events by type')
  .option('-t, --timeout <ms>', 'Timeout in milliseconds', '300000')
  .option('--keep', 'Keep workspace after run')
  .action(async (options) => {
    // Resolve input from file/inline/stdin
    const baseInput = await resolveInput<Partial<ExecuteQueryArgs>>({
      inputFile: options.input,
      inline: options.inline,
    });

    // Merge with command-line overrides
    const input = mergeInput(baseInput, {
      prompt: options.prompt,
      sessionId: options.sessionId,
      architecture: options.architecture as AgentArchitecture,
      model: options.model,
    });

    // Validate required fields
    if (!input.prompt) {
      console.error('Error: prompt is required');
      console.error('Use --prompt <text>, --input <file>, or --inline <json>');
      process.exit(1);
    }

    // Generate session ID if not provided
    if (!input.sessionId) {
      input.sessionId = `harness-${Date.now()}`;
    }

    // Create workspace
    const workspace = await createWorkspace({
      baseDir: options.workspace,
      keep: options.keep,
    });

    input.cwd = workspace.path;

    console.error(`Workspace: ${workspace.path}`);
    console.error(`Session ID: ${input.sessionId}`);
    console.error(`Architecture: ${input.architecture}`);
    console.error(
      `Executing: "${input.prompt.substring(0, 50)}${input.prompt.length > 50 ? '...' : ''}"`
    );
    console.error('');

    const format = options.format as OutputFormat;
    const timeout = parseInt(options.timeout, 10);

    try {
      if (format === 'stream') {
        // Stream mode: print events as they arrive
        const result = await runRunner({
          command: 'execute-query',
          input: input as ExecuteQueryArgs,
          cwd: workspace.path,
          timeout,
          onEvent: (event) => {
            if (!options.filter || event.type === options.filter) {
              console.log(JSON.stringify(event));
            }
          },
        });

        console.error('');
        console.error(`Duration: ${result.duration}ms`);
        console.error(`Exit code: ${result.exitCode}`);

        if (result.exitCode !== 0) {
          console.error('');
          console.error('=== Stderr ===');
          console.error(result.stderr);
        }

        process.exit(result.exitCode);
      } else if (format === 'collect') {
        // Collect mode: output all events as JSON array
        const result = await runRunner({
          command: 'execute-query',
          input: input as ExecuteQueryArgs,
          cwd: workspace.path,
          timeout,
        });

        const parsed = parseJsonlStream(result.stdout);
        console.log(JSON.stringify(parsed.events, null, 2));

        process.exit(result.exitCode);
      } else if (format === 'summary') {
        // Summary mode: human-readable output
        const result = await runRunner({
          command: 'execute-query',
          input: input as ExecuteQueryArgs,
          cwd: workspace.path,
          timeout,
        });

        const parsed = parseJsonlStream(result.stdout);
        console.log(formatSummary(parsed, result.duration));
        console.log(`\nExit code: ${result.exitCode}`);

        if (result.stderr) {
          console.error('\n=== Stderr ===');
          console.error(result.stderr);
        }

        process.exit(result.exitCode);
      }
    } finally {
      await workspace.cleanup();
    }
  });
