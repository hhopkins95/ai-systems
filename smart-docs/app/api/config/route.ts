import { NextResponse } from 'next/server';
import { getServerConfig } from '@/server/config';

export async function GET() {
  try {
    const config = getServerConfig();
    return NextResponse.json(config);
  } catch (error) {
    console.error('Error getting config:', error);
    return NextResponse.json(
      { error: 'Failed to get config' },
      { status: 500 }
    );
  }
}
