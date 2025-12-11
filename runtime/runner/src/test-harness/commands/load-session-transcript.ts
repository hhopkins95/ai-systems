/**
 * load-session-transcript command - test the load-session-transcript runner
 */

import { Command } from 'commander';
import type { AgentArchitecture } from '@ai-systems/shared-types';
import { runRunner } from '../lib/process-runner.js';
import { createWorkspace } from '../lib/workspace.js';
import { resolveInput, mergeInput } from '../lib/input-resolver.js';

interface LoadTranscriptInput {
  projectDir: string;
  sessionId: string;
  architecture: AgentArchitecture;
  sessionTranscript?: string;
}

export const loadSessionTranscriptCommand = new Command(
  'load-session-transcript'
)
  .description('Load session transcript into a workspace')
  .option('-i, --input <file>', 'Input JSON file (transcript data)')
  .option('--inline <json>', 'Inline JSON input')
  .option('-s, --session-id <id>', 'Session ID')
  .option(
    '-a, --architecture <arch>',
    'Architecture (claude-sdk|opencode)',
    'claude-sdk'
  )
  .option('-w, --workspace <dir>', 'Workspace directory')
  .option('--keep', 'Keep workspace after run')
  .action(async (options) => {
    // Resolve input
    const baseInput = await resolveInput<Partial<LoadTranscriptInput>>({
      inputFile: options.input,
      inline: options.inline,
    });

    // Create workspace
    const workspace = await createWorkspace({
      baseDir: options.workspace,
      keep: options.keep,
    });

    // Generate session ID if not provided
    const sessionId =
      options.sessionId || baseInput.sessionId || `harness-${Date.now()}`;

    // Merge input
    const input = mergeInput(baseInput, {
      projectDir: workspace.path,
      sessionId,
      architecture: options.architecture as AgentArchitecture,
    });

    console.error(`Workspace: ${workspace.path}`);
    console.error(`Session ID: ${sessionId}`);
    console.error(`Architecture: ${input.architecture}`);
    console.error('Loading session transcript...');

    try {
      const result = await runRunner({
        command: 'load-session-transcript',
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
