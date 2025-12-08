import { AgentProfile } from "@ai-systems/shared-types"
import { AGENT_ARCHITECTURE_TYPE } from "@ai-systems/shared-types"
import { EnvironmentPrimitive } from "./base"
import { ModalSandbox } from "./modal"
import { ModalContext } from "./modal/client"

type SandboxProviders = "modal"


export const getEnvironmentPrimitive = async (args : { 
    provider : SandboxProviders, 
    agentProfile : AgentProfile,
    modalContext : ModalContext, 
    agentArchitecture : AGENT_ARCHITECTURE_TYPE
}) : Promise<EnvironmentPrimitive> => { 
    return await ModalSandbox.create(args.agentProfile, args.modalContext, args.agentArchitecture);
}
