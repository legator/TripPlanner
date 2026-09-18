import { NextRequest, NextResponse } from 'next/server';
import { callHereIsoline } from '@/lib/providers/here';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const latStr = searchParams.get('lat');
    const lngStr = searchParams.get('lng');
    const rangeMinsStr = searchParams.get('rangeMins') || '15';
    const mode = searchParams.get('mode') || 'car';

    if (!latStr || !lngStr) {
      return NextResponse.json({ error: 'Missing lat or lng parameter' }, { status: 400 });
    }

    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    const rangeMins = parseInt(rangeMinsStr, 10);

    if (isNaN(lat) || isNaN(lng) || isNaN(rangeMins)) {
      return NextResponse.json({ error: 'Invalid coordinates or range' }, { status: 400 });
    }

    const points = await callHereIsoline(lat, lng, rangeMins, mode);
    return NextResponse.json({ points });
  } catch (error) {
    console.error('[api/route/isoline] Error fetching isoline:', error);
    return NextResponse.json({ error: 'Failed to calculate isoline' }, { status: 500 });
  }
}
