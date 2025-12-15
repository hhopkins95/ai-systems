import { NextResponse } from 'next/server';
import { getServices } from '@/server/services';
import type { RuleWithSource } from '@/types';

export async function GET() {
  try {
    const { entityManager } = getServices();

    const rules: RuleWithSource[] = await entityManager.loadRules();

    return NextResponse.json(rules);
  } catch (error) {
    console.error('Error getting rules:', error);
    return NextResponse.json(
      { error: 'Failed to get rules' },
      { status: 500 }
    );
  }
}
