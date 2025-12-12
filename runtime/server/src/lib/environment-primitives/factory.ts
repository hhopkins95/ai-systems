import { RuntimeExecutionEnvironmentOptions } from "../../types/runtime"
import { EnvironmentPrimitive } from "./base"
import { ModalSandbox } from "./modal"
import { LocalPrimitive } from "./local"
import { DockerPrimitive } from "./docker"


export const getEnvironmentPrimitive = async (args : RuntimeExecutionEnvironmentOptions) : Promise<EnvironmentPrimitive> => {
    switch (args.type) {
        case "modal-sandbox":
            return await ModalSandbox.create(args);

        case "local":
            return await LocalPrimitive.create(args);

        case "docker":
            return await DockerPrimitive.create(args);

        default:
            throw new Error(`Invalid execution environment type: ${(args as any).type}`);
    }
}
