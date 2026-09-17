import { NextResponse } from 'next/server';
import { getHereUsageSummary } from '@/lib/quota/hereQuotaGuard';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const summary = await getHereUsageSummary();
    return NextResponse.json(summary);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch HERE quota';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
