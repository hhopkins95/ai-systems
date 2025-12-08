import { NextResponse } from 'next/server';
import { getServices } from '@/server/services';
import type { McpServerConfig } from '@/types';

interface WriteRequestBody {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export async function POST(request: Request) {
  try {
    const body: WriteRequestBody = await request.json();

    // Validate required fields
    if (!body.name || !body.command) {
      return NextResponse.json(
        { error: 'Name and command are required' },
        { status: 400 }
      );
    }

    const { entityManager } = getServices();

    // Build MCP server config
    const mcpServer: McpServerConfig = {
      name: body.name,
      command: body.command,
      args: body.args,
      env: body.env,
    };

    // Write to project .mcp.json (merges with existing)
    const result = await entityManager.writeProjectMcpServers([mcpServer]);

    return NextResponse.json({
      success: true,
      path: result.path,
      created: result.created,
    });
  } catch (error) {
    console.error('Error writing MCP server:', error);
    const message = error instanceof Error ? error.message : 'Failed to write MCP server';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
