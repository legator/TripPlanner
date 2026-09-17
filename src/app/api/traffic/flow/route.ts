import { NextRequest, NextResponse } from 'next/server';
import { fetchHereTrafficFlow } from '@/lib/providers/here';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { corridor, radius = 300 } = body as { corridor?: string; radius?: number };

    if (!corridor) {
      return NextResponse.json({ error: 'Route corridor polyline is required' }, { status: 400 });
    }

    const flowItems = await fetchHereTrafficFlow(corridor, radius);

    // Calculate aggregated corridor flow metrics
    const totalItems = flowItems.length;
    const avgJamFactor = totalItems > 0
      ? Math.round((flowItems.reduce((acc, f) => acc + f.jamFactor, 0) / totalItems) * 10) / 10
      : 0;
    const maxJamFactor = totalItems > 0
      ? Math.max(...flowItems.map((f) => f.jamFactor))
      : 0;
    const congestedSegments = flowItems.filter((f) => f.jamFactor >= 4.0).length;

    return NextResponse.json({
      flow: flowItems,
      summary: {
        totalSegments: totalItems,
        avgJamFactor,
        maxJamFactor,
        congestedSegments,
        congestionLevel: maxJamFactor >= 8 ? 'heavy' : maxJamFactor >= 4 ? 'moderate' : 'light',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch traffic flow';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
