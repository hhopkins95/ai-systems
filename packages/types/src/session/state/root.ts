import { RuntimeState } from "./runtime";
import { SessionConversationState } from "./conversation-state";
import { ExecutionEnvironmentState } from "./execution-environment";

export interface SessionState { 
    conversation: SessionConversationState;
    executionEnvironment: ExecutionEnvironmentState;    
    runtime: RuntimeState;
}