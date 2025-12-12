export type EXECUTION_ENVIRONMENTS = "modal-sandbox" | "local" | "docker"


export type ModalExecutionEnvironmentOptions = { 
    /**
   * Modal API token ID
   * Get from https://modal.com/settings
   */
    tokenId: string;

    /**
     * Modal API token secret
     * Get from https://modal.com/settings
     */
    tokenSecret: string;

    /**
     * Modal app name
     * Must be unique within your Modal account
     */
    appName: string;
}



export type LocalExecutionEnvironmentOptions = {
    /**
     * The default path where the session workspaces should be created.
     *
     * Each session will be in {sessionsDirectoryPath}/{sessionId} by default, unless overridden by the sessionOptions.
     */
    sessionsDirectoryPath: string;

    /**
     * If true, the session workspaces will be deleted when the session is terminated.
     */
    shouldCleanup : boolean
}


export type DockerExecutionEnvironmentOptions = {
    /**
     * Docker image to use for containers.
     * If not provided, uses node:22-slim with CLI tools pre-installed.
     */
    image?: string;

    /**
     * The directory path on host where session workspaces are created.
     * Each session will be in {sessionsDirectoryPath}/{sessionId}.
     */
    sessionsDirectoryPath: string;

    /**
     * If true, the container and workspace will be removed on termination.
     */
    shouldCleanup: boolean;

    /**
     * Container resource limits
     */
    resources?: {
        memory?: string;  // e.g., "2g"
        cpus?: string;    // e.g., "2"
    };

    /**
     * Additional environment variables to pass to container
     */
    env?: Record<string, string>;
}