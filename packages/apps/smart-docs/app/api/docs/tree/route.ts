import { NextResponse } from 'next/server';
import { getServices } from '@/server/services';
import { getServerConfig } from '@/server/config';

export async function GET() {
  try {
    const config = getServerConfig();
    const { markdownService } = getServices();

    const tree = await markdownService.getFileTree(config.docsPath);

    return NextResponse.json({ tree });
  } catch (error) {
    console.error('Error getting file tree:', error);
    return NextResponse.json(
      { error: 'Failed to get file tree' },
      { status: 500 }
    );
  }
}
