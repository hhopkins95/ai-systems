import { NextResponse } from 'next/server';
import { getServices } from '@/server/services';

export async function DELETE(request: Request) {
  try {
    const { pluginId } = await request.json();

    if (!pluginId) {
      return NextResponse.json(
        { error: 'Missing required field: pluginId' },
        { status: 400 }
      );
    }

    const { entityManager } = getServices();
    await entityManager.uninstallPlugin(pluginId);

    return NextResponse.json({
      success: true,
      message: `Plugin "${pluginId}" uninstalled successfully`,
    });
  } catch (error) {
    console.error('Error uninstalling plugin:', error);
    return NextResponse.json(
      { error: 'Failed to uninstall plugin' },
      { status: 500 }
    );
  }
}
