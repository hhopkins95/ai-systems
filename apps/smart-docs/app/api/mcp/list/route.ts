import { NextResponse } from 'next/server';
import { getServices } from '@/server/services';

export async function GET() {
  try {
    const { entityManager } = getServices();

    // loadAgentContext returns mcpServers with source tracking
    const context = await entityManager.loadAgentContext({
      includeDisabledPlugins: true,
    });

    return NextResponse.json({
      mcpServers: context.mcpServers,
    });
  } catch (error) {
    console.error('Error listing MCP servers:', error);
    return NextResponse.json(
      { error: 'Failed to list MCP servers' },
      { status: 500 }
    );
  }
}
