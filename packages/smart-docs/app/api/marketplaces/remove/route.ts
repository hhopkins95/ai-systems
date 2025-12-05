import { NextResponse } from 'next/server';
import { getServices } from '@/server/services';
import { MarketplaceRegistryService } from '@hhopkins/claude-entity-manager';
import * as path from 'path';

export async function DELETE(request: Request) {
  try {
    const { name } = await request.json();

    if (!name) {
      return NextResponse.json(
        { error: 'Missing required field: name' },
        { status: 400 }
      );
    }

    const { entityManager } = getServices();

    // Get the claude dir from the entity manager's config
    // We need to create a registry service to remove the marketplace
    const marketplaces = await entityManager.getMarketplaces();

    if (!marketplaces[name]) {
      return NextResponse.json(
        { error: `Marketplace "${name}" not found` },
        { status: 404 }
      );
    }

    // Get the home directory and create registry service
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const claudeDir = path.join(homeDir, '.claude');
    const registryService = new MarketplaceRegistryService(claudeDir);

    await registryService.removeMarketplace(name);

    return NextResponse.json({
      success: true,
      message: `Marketplace "${name}" removed successfully`,
    });
  } catch (error) {
    console.error('Error removing marketplace:', error);
    return NextResponse.json(
      { error: 'Failed to remove marketplace' },
      { status: 500 }
    );
  }
}
