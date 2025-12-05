import { NextResponse } from 'next/server';
import { getServices } from '@/server/services';

export async function GET() {
  try {
    const { entityManager } = getServices();
    const marketplaces = await entityManager.getMarketplaces();

    return NextResponse.json({ marketplaces });
  } catch (error) {
    console.error('Error listing marketplaces:', error);
    return NextResponse.json(
      { error: 'Failed to list marketplaces' },
      { status: 500 }
    );
  }
}
