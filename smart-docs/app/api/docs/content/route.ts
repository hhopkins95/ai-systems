import { NextRequest, NextResponse } from 'next/server';
import { getServices } from '@/server/services';
import { getServerConfig } from '@/server/config';
import * as path from 'path';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const filePath = searchParams.get('path');

    if (!filePath) {
      return NextResponse.json(
        { error: 'Missing path parameter' },
        { status: 400 }
      );
    }

    const config = getServerConfig();
    const { markdownService } = getServices();

    const absolutePath = path.join(config.docsPath, filePath);

    // Security check: ensure path is within docs directory
    if (!absolutePath.startsWith(config.docsPath)) {
      return NextResponse.json(
        { error: 'Invalid path' },
        { status: 403 }
      );
    }

    const content = await markdownService.readMarkdownFile(absolutePath);

    return NextResponse.json(content);
  } catch (error) {
    console.error('Error reading markdown file:', error);
    return NextResponse.json(
      { error: 'Failed to read file' },
      { status: 500 }
    );
  }
}
