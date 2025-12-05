import { NextResponse } from 'next/server';
import { getServices } from '@/server/services';

export async function POST(request: Request) {
  try {
    const { source } = await request.json();

    if (!source) {
      return NextResponse.json(
        { error: 'Missing required field: source' },
        { status: 400 }
      );
    }

    const { entityManager } = getServices();
    const result = await entityManager.installPlugin(source);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to install plugin' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Plugin installed successfully`,
      pluginId: result.pluginId,
      installPath: result.installPath,
    });
  } catch (error) {
    console.error('Error installing plugin:', error);
    return NextResponse.json(
      { error: 'Failed to install plugin' },
      { status: 500 }
    );
  }
}
