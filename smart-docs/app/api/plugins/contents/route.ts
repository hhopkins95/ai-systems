import { NextResponse } from 'next/server';
import { getServices } from '@/server/services';

export async function POST(request: Request) {
  try {
    const { pluginPath, includeContents = false } = await request.json();

    if (!pluginPath) {
      return NextResponse.json(
        { error: 'Plugin path is required' },
        { status: 400 }
      );
    }

    const { entityManager } = getServices();

    // Load entities from the plugin directory
    const config = await entityManager.loadEntitiesFromDirectory(pluginPath, includeContents);

    return NextResponse.json(config);
  } catch (error) {
    console.error('Error fetching plugin contents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch plugin contents' },
      { status: 500 }
    );
  }
}
