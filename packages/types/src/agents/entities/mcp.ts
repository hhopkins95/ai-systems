import type { McpHttpServerConfig, McpStdioServerConfig } from "@anthropic-ai/claude-agent-sdk";
import { EntitySource } from "../sources";


/**
 * Configuration for an MCP server
 * 
 * -- the field in the actual json file
 */
export type McpServerConfig = McpHttpServerConfig | McpStdioServerConfig; 


/**
 * MCP server with a name -- derived from the json file key
 */
export type McpServer = {name : string} & McpServerConfig;


export type McpServerWithSource = McpServer & {source?: EntitySource};