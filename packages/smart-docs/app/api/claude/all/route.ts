import { NextResponse } from 'next/server';
import { getServices } from '@/server/services';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const includeContents = searchParams.get('includeContents') === 'true';

    const { entityManager } = getServices();

    // loadEntitiesFromEnabledSources() loads from:
    // - Global ~/.claude
    // - Project .claude
    // - All enabled plugins (disabled plugins are excluded)
    const config = await entityManager.loadEntitiesFromEnabledSources(includeContents);

    return NextResponse.json(config);
  } catch (error) {
    console.error('Error getting aggregated Claude config:', error);
    return NextResponse.json(
      { error: 'Failed to get aggregated Claude config' },
      { status: 500 }
    );
  }
}
