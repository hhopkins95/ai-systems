import { NextResponse } from 'next/server';
import { getServices } from '@/server/services';

export async function GET() {
  try {
    const { entityManager } = getServices();

    // ClaudeEntityManager.discoverPlugins() handles:
    // - Registry-based discovery (authoritative)
    // - Directory-based discovery (fallback)
    // - Deduplication
    // - Enabled state merging
    const plugins = await entityManager.discoverPlugins();

    return NextResponse.json({ plugins });
  } catch (error) {
    console.error('Error listing plugins:', error);
    return NextResponse.json(
      { error: 'Failed to list plugins' },
      { status: 500 }
    );
  }
}
