/**
 * Unified Runner CLI - Entry point for execution environments
 *
 * This is the main CLI that gets bundled and copied into execution environments
 * (Modal sandboxes, Docker containers, etc.). It dispatches to subcommands.
 *
 * All commands read their input from stdin as JSON:
 *   runner load-agent-profile < profile.json
 *   runner load-session-transcript < transcript.json
 *   runner execute-query < query.json
 *   runner read-session-transcript < request.json
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

// Stdin-based commands (reads JSON from stdin like the others)
program
  .command('execute-query')
  .description('Execute a query against the agent (reads JSON from stdin)')
  .action(executeQuery);

program
  .command('read-session-transcript')
  .description('Read current session transcript (reads JSON from stdin)')
  .action(readSessionTranscript);

program.parse();
