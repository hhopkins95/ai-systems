import { NextResponse } from 'next/server';
import { getServices } from '@/server/services';
import type { ClaudeMdNode } from '@/types';

export async function GET() {
  try {
    const { entityManager } = getServices();

    const nodes: ClaudeMdNode[] = await entityManager.loadClaudeMdFiles();

    return NextResponse.json(nodes);
  } catch (error) {
    console.error('Error getting CLAUDE.md files:', error);
    return NextResponse.json(
      { error: 'Failed to get CLAUDE.md files' },
      { status: 500 }
    );
  }
}
