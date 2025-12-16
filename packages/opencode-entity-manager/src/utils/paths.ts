/**
 * Path utilities for OpenCode directory structure
 */
import { join } from "path";

/**
 * Get the .opencode directory path for a project
 */
export function getOpenCodeDir(projectDir: string): string {
  return join(projectDir, ".opencode");
}

/**
 * Get the agents directory (.opencode/agent/)
 */
export function getAgentsDir(opencodeDir: string): string {
  return join(opencodeDir, "agent");
}

/**
 * Get the skills directory (.opencode/skills/)
 */
export function getSkillsDir(opencodeDir: string): string {
  return join(opencodeDir, "skills");
}

/**
 * Get the commands directory (.opencode/command/)
 */
export function getCommandsDir(opencodeDir: string): string {
  return join(opencodeDir, "command");
}


export function getRulesDir(opencodeDir : string) : string { 
  return join(opencodeDir, "rules")
}

/**
 * Get the AGENTS.md file path (OpenCode equivalent of CLAUDE.md)
 */
export function getAgentsMdPath(projectDir: string): string {
  return join(projectDir, "AGENTS.md");
}

/**
 * Get the SKILLS.md file path (.opencode/SKILLS.md)
 */
export function getSkillsMdPath(opencodeDir: string): string {
  return join(getRulesDir(opencodeDir), "SKILLS-INSTRUCTIONS.md");
}
