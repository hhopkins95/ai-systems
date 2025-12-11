/**
 * workflow command - run a complete workflow (load profile + execute query)
 *
 * This command combines multiple runner steps into a single test,
 * mimicking a full agent session setup and execution.
 */

import { Command } from 'commander';
import { readFile } from 'fs/promises';
import type { AgentArchitecture } from '@ai-systems/shared-types';
import type { ExecuteQueryArgs, SetupSessionInput } from '../../types.js';
import { runRunner } from '../lib/process-runner.js';
import { createWorkspace } from '../lib/workspace.js';
import { parseJsonlStream, formatSummary } from '../lib/stream-parser.js';
import type { OutputFormat } from '../types.js';

export const workflowCommand = new Command('workflow')
  .description('Run a complete workflow: load profile, optionally load transcript, then execute query')
  .option('--agent <file>', 'Agent profile JSON file')
  .option('--transcript <file>', 'Session transcript JSON file (optional)')
  .option('-p, --prompt <text>', 'Query prompt (required)')
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
    'summary'
  )
  .option('-t, --timeout <ms>', 'Timeout in milliseconds', '300000')
  .option('--keep', 'Keep workspace after run')
  .action(async (options) => {
    // Validate required fields
    if (!options.prompt) {
      console.error('Error: --prompt is required');
      process.exit(1);
    }

    const architecture = options.architecture as AgentArchitecture;
    const sessionId = options.sessionId || `harness-${Date.now()}`;
    const format = options.format as OutputFormat;
    const timeout = parseInt(options.timeout, 10);

    // Create workspace
    const workspace = await createWorkspace({
      baseDir: options.workspace,
      keep: options.keep,
    });

    console.error(`Workspace: ${workspace.path}`);
    console.error(`Session ID: ${sessionId}`);
    console.error(`Architecture: ${architecture}`);
    console.error('');

    try {
      // Step 1: Load agent profile (if provided)
      if (options.agent) {
        console.error('=== Step 1: Loading agent profile ===');
        const agentContent = await readFile(options.agent, 'utf-8');
        const agentInput: SetupSessionInput = {
          ...JSON.parse(agentContent),
          projectDir: workspace.path,
          architecture,
        };

        const profileResult = await runRunner({
          command: 'load-agent-profile',
          input: agentInput,
          cwd: workspace.path,
        });

        if (profileResult.exitCode !== 0) {
          console.error('Failed to load agent profile');
          console.error(profileResult.stderr);
          process.exit(profileResult.exitCode);
        }

        console.error(`Done (${profileResult.duration}ms)`);
        console.error('');
      }

      // Step 2: Load session transcript (if provided)
      if (options.transcript) {
        console.error('=== Step 2: Loading session transcript ===');
        const transcriptContent = await readFile(options.transcript, 'utf-8');
        const transcriptInput = {
          ...JSON.parse(transcriptContent),
          projectDir: workspace.path,
          sessionId,
          architecture,
        };

        const transcriptResult = await runRunner({
          command: 'load-session-transcript',
          input: transcriptInput,
          cwd: workspace.path,
        });

        if (transcriptResult.exitCode !== 0) {
          console.error('Failed to load session transcript');
          console.error(transcriptResult.stderr);
          process.exit(transcriptResult.exitCode);
        }

        console.error(`Done (${transcriptResult.duration}ms)`);
        console.error('');
      }

      // Step 3: Execute query
      console.error('=== Step 3: Executing query ===');
      console.error(
        `Prompt: "${options.prompt.substring(0, 50)}${options.prompt.length > 50 ? '...' : ''}"`
      );
      console.error('');

      const queryInput: ExecuteQueryArgs = {
        prompt: options.prompt,
        sessionId,
        architecture,
        cwd: workspace.path,
        model: options.model,
      };

      if (format === 'stream') {
        const result = await runRunner({
          command: 'execute-query',
          input: queryInput,
          cwd: workspace.path,
          timeout,
          onEvent: (event) => {
            console.log(JSON.stringify(event));
          },
        });

        console.error('');
        console.error(`Duration: ${result.duration}ms`);
        console.error(`Exit code: ${result.exitCode}`);

        process.exit(result.exitCode);
      } else if (format === 'collect') {
        const result = await runRunner({
          command: 'execute-query',
          input: queryInput,
          cwd: workspace.path,
          timeout,
        });

        const parsed = parseJsonlStream(result.stdout);
        console.log(JSON.stringify(parsed.events, null, 2));

        process.exit(result.exitCode);
      } else {
        // summary format
        const result = await runRunner({
          command: 'execute-query',
          input: queryInput,
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
    } catch (err) {
      console.error('Workflow error:', err);
      process.exit(1);
    } finally {
      if (options.keep || options.workspace) {
        console.error(`\nWorkspace preserved at: ${workspace.path}`);
      }
      await workspace.cleanup();
    }
  });
