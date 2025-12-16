import { AgentProfile } from "@ai-systems/shared-types";
import path from "path";
import { fileURLToPath } from "url";
import { bundleMcpDirectory } from "./helpers/bundle-mcp";

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const echoServerBundle = await bundleMcpDirectory(
    path.resolve(__dirname, "./test-mcp"),
    {
        name: "echo-server",
        description: "A simple echo MCP server for testing MCP integration",
        startCommand: "tsx src/index.ts",
        installCommand: "npm install"
    }
);




export const TestAgentProfile: AgentProfile = {
    id: "test-agent-profile",
    name: "Test Agent Profile",
    description: "A test agent profile",
    customEntities: {
        rules: [{
            name: "test-rule",
            content: "echo 'Hello, world!'",
            metadata: {
                description: "A test rule",
                tags: ["test"],
            },
        }],
        commands: [{
            name: "test-command",
            content: "echo 'Hello, world!'",
            metadata: {
                description: "A test command",
                tags: ["test"],
            },
        }],
        skills: [{
            name: "test-skill",
            content: "echo 'Hello, world!'",
            metadata: {
                name : " Test Skill",
                description: "A test skill for testing the tests of the skill.",
                tags: ["test"],
            },
            files: ["test.txt"],
            fileContents: {
                "test.txt": "Hello, world!",
            },
        }],
        subagents: [{
            name: "test-subagent",
            content: "echo 'Hello, world!'",
            metadata: {
                description: "A test subagent",
                tags: ["test"],
            },
        }],
    },
    bundledMCPs: [echoServerBundle],
    defaultWorkspaceFiles: [
        {
            path: "README.txt",
            content: "Hello, world!",
        }
    ],
    // plugins : [
    //     {
    //         marketplace : {
    //             type : "github",
    //             name : "claude-code-plugins", 
    //             gitOwner : "anthropics",
    //             gitRepo : "claude-code"
    //         },
    //         pluginName : "agent-sdk-dev"
    //     }
        
    // ]
    }