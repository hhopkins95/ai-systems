import { NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'fs/promises';
import * as path from 'path';
import { getServerConfig } from '@/server/config';

interface McpJsonConfig {
  mcpServers?: Record<string, {
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }>;
}

interface DeleteRequestBody {
  name: string;
}

export async function DELETE(request: Request) {
  try {
    const body: DeleteRequestBody = await request.json();

    if (!body.name) {
      return NextResponse.json(
        { error: 'Server name is required' },
        { status: 400 }
      );
    }

    const config = getServerConfig();
    const mcpPath = path.join(config.projectRoot, '.claude', '.mcp.json');

    // Read existing config
    let mcpConfig: McpJsonConfig = { mcpServers: {} };
    try {
      const content = await readFile(mcpPath, 'utf-8');
      mcpConfig = JSON.parse(content) as McpJsonConfig;
      if (!mcpConfig.mcpServers) {
        mcpConfig.mcpServers = {};
      }
    } catch (error) {
      // File doesn't exist - nothing to delete
      return NextResponse.json(
        { error: `MCP server '${body.name}' not found` },
        { status: 404 }
      );
    }

    // Check if server exists
    if (!(body.name in mcpConfig.mcpServers)) {
      return NextResponse.json(
        { error: `MCP server '${body.name}' not found` },
        { status: 404 }
      );
    }

    // Remove the server
    delete mcpConfig.mcpServers[body.name];

    // Ensure directory exists
    await mkdir(path.dirname(mcpPath), { recursive: true });

    // Write back
    await writeFile(mcpPath, JSON.stringify(mcpConfig, null, 2), 'utf-8');

    return NextResponse.json({
      success: true,
      deleted: body.name,
    });
  } catch (error) {
    console.error('Error deleting MCP server:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete MCP server';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
