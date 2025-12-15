import { NextResponse } from 'next/server';
import { getServices } from '@/server/services';
import type { McpServerInput } from '@hhopkins/claude-entity-manager';

interface WriteRequestBody {
  name: string;
  type?: 'stdio' | 'http';
  // Stdio fields
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // HTTP fields
  url?: string;
  headers?: Record<string, string>;
}

export async function POST(request: Request) {
  try {
    const body: WriteRequestBody = await request.json();

    // Validate required fields based on type
    if (!body.name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    const isHttp = body.type === 'http' || (!body.type && body.url && !body.command);

    if (isHttp) {
      if (!body.url) {
        return NextResponse.json(
          { error: 'URL is required for HTTP servers' },
          { status: 400 }
        );
      }
    } else {
      if (!body.command) {
        return NextResponse.json(
          { error: 'Command is required for stdio servers' },
          { status: 400 }
        );
      }
    }

    const { entityManager } = getServices();

    // Build MCP server config based on type
    const mcpServer: McpServerInput = {
      name: body.name,
      type: body.type,
    };

    if (isHttp) {
      mcpServer.type = 'http';
      mcpServer.url = body.url;
      mcpServer.headers = body.headers;
    } else {
      mcpServer.command = body.command;
      mcpServer.args = body.args;
      mcpServer.env = body.env;
    }

    // Write to project .mcp.json (merges with existing)
    const result = await entityManager.writeMcpServers([mcpServer]);

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
