/**
 * Runtime state for a session.
 */
export interface RuntimeState {
    isLoaded: boolean;
    activeQuery?: {
        startedAt: number;
    }
}

