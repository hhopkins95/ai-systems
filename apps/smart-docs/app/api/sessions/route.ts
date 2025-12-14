import { NextResponse } from 'next/server';
import { getServices } from '@/server/services';
import type { SessionMetadata } from '@/types';

export async function GET() {
  try {
    const { entityManager } = getServices();

    // List all session IDs for the current project
    const sessionIds = await entityManager.listSessions();

    // Get metadata for each session
    const sessions: SessionMetadata[] = [];
    for (const sessionId of sessionIds) {
      try {
        const metadata = await entityManager.getSessionMetadata(sessionId);
        sessions.push(metadata);
      } catch (err) {
        // Skip sessions that fail to load metadata
        console.warn(`Failed to load metadata for session ${sessionId}:`, err);
      }
    }

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
