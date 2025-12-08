import { RuntimeExecutionEnvironmentOptions } from "../../types/runtime"
import { EnvironmentPrimitive } from "./base"
import { ModalSandbox } from "./modal"


export const getEnvironmentPrimitive = async (args : RuntimeExecutionEnvironmentOptions) : Promise<EnvironmentPrimitive> => { 

    if (args.type === "modal-sandbox") {
        return await ModalSandbox.create(args);
    } else if (args.type === "local") {
        throw new Error("Local execution environment not implemented");
    }
    else {
        throw new Error("Invalid execution environment type");
    }
}
