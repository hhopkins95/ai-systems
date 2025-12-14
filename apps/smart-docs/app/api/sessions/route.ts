import { NextResponse } from 'next/server';
import { getServices } from '@/server/services';

export async function GET() {
  try {
    const { entityManager } = getServices();

    // Use efficient batch method that builds subagent map once
    const sessions = await entityManager.listSessionsWithMetadata();

    // Sort by modified date, newest first
    sessions.sort((a, b) =>
      new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
    );

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('Error listing sessions:', error);
    return NextResponse.json(
      { error: 'Failed to list sessions', details: String(error) },
      { status: 500 }
    );
  }
}
