import os from "os"
import { join } from "path"
import { mkdir } from "fs/promises"

export const getClaudeTranscriptDir = async (projectDir: string): Promise<string> => {
    const homeDir = os.homedir()
    const projectId = projectDir.replace('/', '-').replace(' ', '-');
    const transcriptDir = join(homeDir, '.claude', 'projects', projectId);
    await mkdir(transcriptDir, { recursive: true });

    return transcriptDir;
}