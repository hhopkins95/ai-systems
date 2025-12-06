import type { ServerConfig } from '@/types';

export function getServerConfig(): ServerConfig {
  const docsPath = process.env.SMART_DOCS_PATH;
  const projectRoot = process.env.SMART_DOCS_PROJECT_ROOT;
  const homeDir = process.env.SMART_DOCS_HOME_DIR;

  if (!docsPath || !projectRoot || !homeDir) {
    throw new Error('Server configuration missing. Make sure to start via the CLI.');
  }

  return {
    docsPath,
    projectRoot,
    homeDir,
  };
}
