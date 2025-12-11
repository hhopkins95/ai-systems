/**
 * load-agent-profile command - test the load-agent-profile runner
 */

import { Command } from 'commander';
import type { AgentArchitecture } from '@ai-systems/shared-types';
import type { SetupSessionInput } from '../../types.js';
import { runRunner } from '../lib/process-runner.js';
import { createWorkspace } from '../lib/workspace.js';
import { resolveInput, mergeInput } from '../lib/input-resolver.js';

export const loadAgentProfileCommand = new Command('load-agent-profile')
  .description('Load agent profile into a workspace')
  .option('-i, --input <file>', 'Input JSON file (agent profile)')
  .option('--inline <json>', 'Inline JSON input')
  .option(
    '-a, --architecture <arch>',
    'Architecture (claude-sdk|opencode)',
    'claude-sdk'
  )
  .option('-w, --workspace <dir>', 'Workspace directory')
  .option('--keep', 'Keep workspace after run')
  .option('--clean', 'Clean workspace before run')
  .action(async (options) => {
    // Resolve input
    const baseInput = await resolveInput<Partial<SetupSessionInput>>({
      inputFile: options.input,
      inline: options.inline,
    });

    // Create workspace
    const workspace = await createWorkspace({
      baseDir: options.workspace,
      keep: options.keep,
      clean: options.clean,
    });

    // Merge input with workspace path and architecture
    const input = mergeInput(baseInput, {
      projectDir: workspace.path,
      architecture: options.architecture as AgentArchitecture,
    });

    console.error(`Workspace: ${workspace.path}`);
    console.error(`Architecture: ${input.architecture}`);
    console.error('Loading agent profile...');

    try {
      const result = await runRunner({
        command: 'load-agent-profile',
        input,
        cwd: workspace.path,
      });

      // Output the result
      if (result.stdout.trim()) {
        try {
          const output = JSON.parse(result.stdout);
          console.log(JSON.stringify(output, null, 2));
        } catch {
          console.log(result.stdout);
        }
      }

      if (result.stderr) {
        console.error('\n=== Stderr ===');
        console.error(result.stderr);
      }

      console.error('');
      console.error(`Duration: ${result.duration}ms`);
      console.error(`Exit code: ${result.exitCode}`);

      if (options.keep || options.workspace) {
        console.error(`\nWorkspace preserved at: ${workspace.path}`);
      }

      process.exit(result.exitCode);
    } catch (err) {
      console.error('Error:', err);
      process.exit(1);
    } finally {
      await workspace.cleanup();
    }
  });
