// /**
//  * Execution Environment Factory
//  *
//  * Creates ExecutionEnvironment instances based on runtime configuration.
//  */

// import type { AGENT_ARCHITECTURE_TYPE, AgentProfile } from '@ai-systems/shared-types';
// import type { RuntimeConfig } from '../../types/runtime.js';
// import type { ExecutionEnvironment } from './base.js';
// import { ModalSandboxExecutionEnvironment, ModalContext } from './modal-sandbox/index.js';

// /**
//  * Options for creating an execution environment
//  */
// export interface CreateExecutionEnvironmentOptions {
//     architecture: AGENT_ARCHITECTURE_TYPE;
//     agentProfile: AgentProfile;
//     modalContext?: ModalContext;
// }

// /**
//  * Create an ExecutionEnvironment based on the runtime configuration
//  *
//  * @param sessionId - The session ID for this environment
//  * @param config - The runtime execution environment configuration
//  * @param options - Additional options including architecture and profile
//  * @returns A configured ExecutionEnvironment instance
//  */
// export async function getExecutionEnvironment(
//     sessionId: string,
//     config: RuntimeConfig['executionEnvironment'],
//     options: CreateExecutionEnvironmentOptions
// ): Promise<ExecutionEnvironment> {
//     switch (config.type) {
//         case 'modal-sandbox': {
//             if (!options.modalContext) {
//                 throw new Error('Modal context is required for modal-sandbox execution environment');
//             }

//             return ModalSandboxExecutionEnvironment.create(
//                 sessionId,
//                 options.architecture,
//                 options.agentProfile,
//                 options.modalContext
//             );
//         }

//         case 'local': {
//             // TODO: Implement LocalExecutionEnvironment
//             throw new Error('Local execution environment not yet implemented');
//         }

//         default:
//             throw new Error(`Unknown execution environment type: ${(config as any).type}`);
//     }
// }
