#!/usr/bin/env node
/**
 * Test Harness CLI - Entry point for testing runner scripts locally
 *
 * This CLI mimics how the execution environment invokes runners:
 * - Spawns runner as subprocess
 * - Pipes JSON input to stdin
 * - Reads stdout (JSONL for streaming, JSON for others)
 *
 * Usage:
 *   pnpm --filter @hhopkins/agent-runner harness <command> [options]
 *
 * Commands:
 *   execute-query           Execute a query against the agent
 *   load-agent-profile      Load agent profile into workspace
 *   load-session-transcript Load session transcript into workspace
 *   read-session-transcript Read session transcript from workspace
 *   workflow                Run a complete workflow (profile + query)
 */

import { Command } from 'commander';
import { executeQueryCommand } from './commands/execute-query.js';
import { loadAgentProfileCommand } from './commands/load-agent-profile.js';
import { loadSessionTranscriptCommand } from './commands/load-session-transcript.js';
import { readSessionTranscriptCommand } from './commands/read-session-transcript.js';
import { workflowCommand } from './commands/workflow.js';

const program = new Command();

program
  .name('harness')
  .description('Test harness for agent runner CLI scripts')
  .version('0.1.0');

// Register all commands
program.addCommand(executeQueryCommand);
program.addCommand(loadAgentProfileCommand);
program.addCommand(loadSessionTranscriptCommand);
program.addCommand(readSessionTranscriptCommand);
program.addCommand(workflowCommand);

program.parse();
