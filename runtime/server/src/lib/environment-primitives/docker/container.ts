import { execSync } from 'child_process';
import { logger } from '../../../config/logger';

export interface ContainerConfig {
    id: string;
    image: string;
    hostBasePath: string;
    env?: Record<string, string>;
    resources?: {
        memory?: string;
        cpus?: string;
    };
}

/**
 * Default image matching Modal's configuration.
 * Pre-built with Node.js 22 and CLI tools.
 */
export const DEFAULT_IMAGE = 'node:22-slim';

/**
 * Commands to install CLI tools (matching Modal sandbox).
 */
export const TOOL_INSTALL_COMMANDS = [
    'npm install -g @anthropic-ai/claude-code',
    'npm install -g @google/gemini-cli',
    'npm install -g opencode-ai@latest',
    'npm install -g tsx',
    'npm install -g chokidar-cli',
];

/**
 * Create and start a Docker container.
 * The container uses volume mounts for file operations.
 */
export async function createContainer(config: ContainerConfig): Promise<void> {
    const args = [
        'run',
        '-d',  // detached
        '--name', config.id,
        '-w', '/workspace',
        // Mount session directories
        '-v', `${config.hostBasePath}/app:/app`,
        '-v', `${config.hostBasePath}/workspace:/workspace`,
        '-v', `${config.hostBasePath}/home:/root`,
        '-v', `${config.hostBasePath}/mcps:/mcps`,
    ];

    // Add resource limits
    if (config.resources?.memory) {
        args.push('-m', config.resources.memory);
    }
    if (config.resources?.cpus) {
        args.push('--cpus', config.resources.cpus);
    }

    // Add environment variables
    if (config.env) {
        for (const [key, value] of Object.entries(config.env)) {
            args.push('-e', `${key}=${value}`);
        }
    }

    // Keep container alive with tail -f /dev/null
    args.push(config.image, 'tail', '-f', '/dev/null');

    logger.info({ containerId: config.id, image: config.image }, 'Creating Docker container');

    try {
        execSync(`docker ${args.join(' ')}`, { stdio: 'pipe' });
    } catch (err: any) {
        const stderr = err.stderr?.toString() || err.message;
        logger.error({ error: stderr }, 'Failed to create Docker container');
        throw new Error(`Failed to create Docker container: ${stderr}`);
    }
}

/**
 * Install CLI tools in the container.
 * Only needed when using base node:22-slim image.
 */
export async function installTools(containerId: string): Promise<void> {
    logger.info({ containerId }, 'Installing CLI tools in container');

    for (const cmd of TOOL_INSTALL_COMMANDS) {
        try {
            execSync(`docker exec ${containerId} sh -c "${cmd}"`, {
                stdio: 'pipe',
                timeout: 120000  // 2 min timeout per install
            });
            logger.debug({ containerId, cmd }, 'Tool installed');
        } catch (err: any) {
            logger.warn({ containerId, cmd, error: err.message }, 'Failed to install tool');
        }
    }
}

/**
 * Remove a Docker container.
 */
export async function removeContainer(containerId: string): Promise<void> {
    try {
        execSync(`docker rm -f ${containerId}`, { stdio: 'pipe' });
        logger.info({ containerId }, 'Docker container removed');
    } catch (err) {
        logger.warn({ containerId, error: err }, 'Failed to remove Docker container');
    }
}

/**
 * Check if a container is running.
 */
export function isContainerRunning(containerId: string): boolean {
    try {
        const result = execSync(
            `docker inspect -f '{{.State.Running}}' ${containerId}`,
            { stdio: 'pipe' }
        ).toString().trim();
        return result === 'true';
    } catch {
        return false;
    }
}
