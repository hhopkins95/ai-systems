/**
 * Execution environment status values.
 * Represents the lifecycle state of the execution environment container.
 */
export type ExecutionEnvironmentStatus =
  | 'inactive'      // No environment exists
  | 'starting'      // Being created/initialized
  | 'ready'         // Healthy and running
  | 'error'         // Encountered an error
  | 'terminated';   // Shut down (timeout, explicit, or crash)

// =============================================================================
// Runtime Layer Types (derived state, never persisted)
// =============================================================================

/**
 * Error information for the execution environment
 */
export interface ExecutionEnvironmentError {
    /** Error message */
    message: string;
    /** Error code for programmatic handling */
    code?: string;
    /** When the error occurred */
    timestamp: number;
}

/**
 * Execution environment state.
 * Represents the container that runs agent queries.
 */
export interface ExecutionEnvironmentState {
    /** Environment ID - available after 'starting' phase */
    id?: string;
    /** Current lifecycle status */
    status: ExecutionEnvironmentStatus;
    /** Human-readable status message for UI display */
    statusMessage?: string;
    /** Last health check timestamp */
    lastHealthCheck?: number;
    /** Number of times the environment has been restarted */
    restartCount?: number;
    /** Last error encountered, if status is 'error' */
    lastError?: ExecutionEnvironmentError;
}

