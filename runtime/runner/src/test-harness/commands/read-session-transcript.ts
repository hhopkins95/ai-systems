/**
 * read-session-transcript command - test the read-session-transcript runner
 */

import { Command } from 'commander';
import type { AgentArchitecture } from '@ai-systems/shared-types';
import { runRunner } from '../lib/process-runner.js';
import { createWorkspace } from '../lib/workspace.js';
import { resolveInput, mergeInput } from '../lib/input-resolver.js';

interface ReadTranscriptInput {
  projectDir: string;
  sessionId: string;
  architecture: AgentArchitecture;
}

export const readSessionTranscriptCommand = new Command(
  'read-session-transcript'
)
  .description('Read session transcript from a workspace')
  .option('-i, --input <file>', 'Input JSON file')
  .option('--inline <json>', 'Inline JSON input')
  .option('-s, --session-id <id>', 'Session ID (required)')
  .option(
    '-a, --architecture <arch>',
    'Architecture (claude-sdk|opencode)',
    'claude-sdk'
  )
  .option('-w, --workspace <dir>', 'Workspace directory')
  .option('--keep', 'Keep workspace after run')
  .action(async (options) => {
    // Resolve input
    const baseInput = await resolveInput<Partial<ReadTranscriptInput>>({
      inputFile: options.input,
      inline: options.inline,
    });

    // Create/use workspace
    const workspace = await createWorkspace({
      baseDir: options.workspace,
      keep: options.keep,
    });

    // Session ID is required for this command
    const sessionId = options.sessionId || baseInput.sessionId;
    if (!sessionId) {
      console.error('Error: session-id is required');
      console.error('Use --session-id <id> or provide in input file');
      process.exit(1);
    }

    // Merge input
    const input = mergeInput(baseInput, {
      projectDir: workspace.path,
      sessionId,
      architecture: options.architecture as AgentArchitecture,
    });

    console.error(`Workspace: ${workspace.path}`);
    console.error(`Session ID: ${sessionId}`);
    console.error(`Architecture: ${input.architecture}`);
    console.error('Reading session transcript...');

    try {
      const result = await runRunner({
        command: 'read-session-transcript',
        input,
        cwd: workspace.path,
      });

      // Output the result (should be JSON transcript)
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

      process.exit(result.exitCode);
    } catch (err) {
      console.error('Error:', err);
      process.exit(1);
    } finally {
      await workspace.cleanup();
    }
  });
