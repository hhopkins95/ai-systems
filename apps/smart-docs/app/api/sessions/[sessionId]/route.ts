import { NextRequest, NextResponse } from 'next/server';
import { getServices } from '@/server/services';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const { entityManager } = getServices();

    // Get the transcript as blocks (uses our converters)
    const transcript = await entityManager.readSessionBlocks(sessionId);

    return NextResponse.json(transcript);
  } catch (error) {
    console.error('Error reading session:', error);
    return NextResponse.json(
      { error: 'Failed to read session', details: String(error) },
      { status: 500 }
    );
  }
}
