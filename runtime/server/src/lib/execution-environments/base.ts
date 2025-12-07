

export interface ExecutionEnvironment {

    prepareSession : (args : {sessionId : string, agentProfile : AgentProfile}) => Promise<void>,



}