import { NextResponse } from 'next/server';
import { getServices } from '@/server/services';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const includeContents = searchParams.get('includeContents') === 'true';

    const { entityManager } = getServices();

    // ClaudeEntityManager.loadAllEntities() handles:
    // - Loading from global ~/.claude
    // - Loading from project .claude
    // - Loading from all enabled plugins
    // - File content loading when requested
    const config = await entityManager.loadAllEntities(includeContents);

    return NextResponse.json(config);
  } catch (error) {
    console.error('Error getting aggregated Claude config:', error);
    return NextResponse.json(
      { error: 'Failed to get aggregated Claude config' },
      { status: 500 }
    );
  }
}
