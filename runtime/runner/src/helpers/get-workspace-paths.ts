import path from 'path';

export const getWorkspacePaths = ({baseWorkspacePath}: {baseWorkspacePath: string}) => {

    const claudeConfigDir = path.join(baseWorkspacePath, '.claude');
    const opencodeConfigDir = path.join(baseWorkspacePath, '.opencode');
    const opencodeConfigFile = path.join(baseWorkspacePath, 'opencode.json'); // the opencode.json file
    const bundledMCPsDir = path.join(baseWorkspacePath, 'mcp');
    const workspaceDir = path.join(baseWorkspacePath, 'workspace');

    return {
        workspaceDir,
        claudeConfigDir,
        opencodeConfigDir,
        opencodeConfigFile,
        bundledMCPsDir,
    }

}