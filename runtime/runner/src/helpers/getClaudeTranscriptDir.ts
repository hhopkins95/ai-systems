import os from "os"
import { join } from "path"
import { mkdir } from "fs/promises"

/**
 * Get the directory where Claude session transcripts are stored.
 * Uses CLAUDE_CONFIG_DIR if set (for session isolation), otherwise falls back to ~/.claude
 */
export const getClaudeTranscriptDir = async (projectDir: string): Promise<string> => {
    // Use CLAUDE_CONFIG_DIR if set, otherwise fall back to home directory
    const claudeConfigDir = process.env.CLAUDE_CONFIG_DIR || join(os.homedir(), '.claude');
    const projectId = projectDir.replace('/', '-').replace(' ', '-');
    const transcriptDir = join(claudeConfigDir, 'projects', projectId);
    await mkdir(transcriptDir, { recursive: true });

    return transcriptDir;
}