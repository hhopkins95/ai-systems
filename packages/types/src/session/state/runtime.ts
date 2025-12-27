/**
 * Runtime state for a session.
 */

/**
 * Active query state - tracks when a query is being processed
 */
export interface ActiveQueryState {
  startedAt: number;
}

/**
 * Runtime state for a session.
 * Tracks session loading status and active query.
 */
export interface RuntimeState {
  isLoaded: boolean;
  activeQuery?: ActiveQueryState;
}

/**
 * Create initial runtime state
 */
export function createInitialRuntimeState(): RuntimeState {
  return { isLoaded: false };
}
