import { getWorkspacePaths } from "./get-workspace-paths";

/**
 * Set up the environment for agent runner cli scripts
 */
export const setEnvironment = ({baseWorkspacePath}: {baseWorkspacePath: string}) => {
    const paths = getWorkspacePaths({baseWorkspacePath});

    process.env.CLAUDE_CONFIG_DIR = paths.claudeConfigDir;
    process.env.OPENCODE_CONFIG_DIR = paths.opencodeConfigDir;
    process.env.OPENCODE_CONFIG = paths.opencodeConfigFile;

}