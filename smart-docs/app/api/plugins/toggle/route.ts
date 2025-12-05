import { NextRequest, NextResponse } from 'next/server';
import { getServices } from '@/server/services';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pluginId, enabled } = body;

    if (!pluginId || typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { entityManager } = getServices();

    if (enabled) {
      await entityManager.enablePlugin(pluginId);
    } else {
      await entityManager.disablePlugin(pluginId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error toggling plugin:', error);
    return NextResponse.json(
      { error: 'Failed to toggle plugin' },
      { status: 500 }
    );
  }
}
