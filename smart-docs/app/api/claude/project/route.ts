import { NextResponse } from 'next/server';
import { getServices } from '@/server/services';
import { getServerConfig } from '@/server/config';
import * as path from 'path';

export async function GET() {
  try {
    const config = getServerConfig();
    const { entityManager } = getServices();

    const claudePath = path.join(config.projectRoot, '.claude');
    const claudeConfig = await entityManager.loadEntitiesFromDirectory(claudePath);

    return NextResponse.json(claudeConfig);
  } catch (error) {
    console.error('Error getting project Claude config:', error);
    return NextResponse.json(
      { error: 'Failed to get project Claude config' },
      { status: 500 }
    );
  }
}
