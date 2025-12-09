/**
 * Unified Runner CLI - Entry point for execution environments
 *
 * This is the main CLI that gets bundled and copied into execution environments
 * (Modal sandboxes, Docker containers, etc.). It dispatches to subcommands.
 *
 * Usage:
 *   runner load-agent-profile < profile.json
 *   runner load-session-transcript < transcript.json
 *   runner execute-query "<prompt>" --architecture <arch> --session-id <id> [options]
 *   runner read-session-transcript <session-id> --architecture <arch> --project-dir <path>
 */

import { Command } from 'commander';
import { loadAgentProfile } from './load-agent-profile.js';
import { loadSessionTranscript } from './load-session-transcript.js';
import { executeQuery } from './execute-query.js';
import { readSessionTranscript } from './read-session-transcript.js';

const program = new Command();

program
  .name('runner')
  .description('Agent runner CLI for execution environments')
  .version('0.2.0');

// Stdin-based commands (no additional args needed)
program
  .command('load-agent-profile')
  .description('Load agent profile into the environment (reads JSON from stdin)')
  .action(loadAgentProfile);

program
  .command('load-session-transcript')
  .description('Load session transcript (reads JSON from stdin)')
  .action(loadSessionTranscript);

// Arg-based commands - these parse their own args via commander
program
  .command('execute-query')
  .description('Execute a query against the agent')
  .allowUnknownOption()
  .action(() => executeQuery());

program
  .command('read-session-transcript')
  .description('Read current session transcript')
  .allowUnknownOption()
  .action(() => readSessionTranscript());

program.parse();
