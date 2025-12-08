export type EXECUTION_ENVIRONMENTS = "modal-sandbox" | "local"


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