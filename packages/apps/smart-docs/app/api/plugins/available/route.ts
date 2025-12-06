import { NextResponse } from 'next/server';
import { getServices } from '@/server/services';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const marketplaceName = searchParams.get('marketplace');

    if (!marketplaceName) {
      return NextResponse.json(
        { error: 'Missing required query parameter: marketplace' },
        { status: 400 }
      );
    }

    const { entityManager } = getServices();

    // Get the marketplace manifest (lists all plugins in the marketplace)
    const manifest = await entityManager.getMarketplaceManifest(marketplaceName);

    if (!manifest) {
      return NextResponse.json(
        { error: `Marketplace "${marketplaceName}" not found` },
        { status: 404 }
      );
    }

    // Get currently discovered/installed plugins
    const installedPlugins = await entityManager.discoverPlugins();
    const installedIds = new Set(installedPlugins.map(p => p.id));

    // Filter to only plugins not yet installed
    const available = manifest.plugins.filter(plugin => {
      const pluginId = `${plugin.name}@${marketplaceName}`;
      return !installedIds.has(pluginId);
    });

    return NextResponse.json({
      marketplace: marketplaceName,
      available,
      totalInMarketplace: manifest.plugins.length,
      installedCount: manifest.plugins.length - available.length,
    });
  } catch (error) {
    console.error('Error getting available plugins:', error);
    return NextResponse.json(
      { error: 'Failed to get available plugins' },
      { status: 500 }
    );
  }
}
