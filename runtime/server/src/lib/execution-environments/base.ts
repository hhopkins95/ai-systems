import { AgentArchitectureSessionOptions, AgentProfile, StreamEvent, WorkspaceFile } from "@ai-systems/shared-types";

/**
 * Event emitted when a workspace file changes
 */
export interface WorkspaceFileEvent {
    type: 'add' | 'change' | 'unlink';
    path: string;
    content?: string;
}

/**
 * Event emitted when a transcript changes.
 * Contains the full combined transcript (main + subagents as a single JSON blob).
 */
export interface TranscriptChangeEvent {
    content: string;
}


export interface ExecutionEnvironment {
    prepareSession : (args : {
        sessionId : string, 
        agentProfile : AgentProfile,
        workspaceFiles : WorkspaceFile[], 
        sessionTranscript? : string,
        sessionOptions? : AgentArchitectureSessionOptions
    }) => Promise<void>,

    executeQuery : (args : {query : string, options? : AgentArchitectureSessionOptions}) => AsyncGenerator<StreamEvent>,

    readSessionTranscript : () => Promise<string | null>,

    watchWorkspaceFiles: (callback: (event: WorkspaceFileEvent) => void) => Promise<void>;
   
    watchSessionTranscriptChanges: (callback: (event: TranscriptChangeEvent) => void) => Promise<void>;

    cleanup : () => Promise<void>,

    isHealthy : () => Promise<boolean>,
}