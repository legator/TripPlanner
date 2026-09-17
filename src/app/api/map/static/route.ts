import { NextRequest, NextResponse } from 'next/server';
import { getHereStaticMapUrl } from '@/lib/providers/here';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const width = parseInt(searchParams.get('w') || '800', 10);
    const height = parseInt(searchParams.get('h') || '500', 10);
    const format = (searchParams.get('f') || 'png') as 'png' | 'jpg';
    const polyline = searchParams.get('polyline') || undefined;
    const centerStr = searchParams.get('center');
    const zoomStr = searchParams.get('zoom');
    const pointsStr = searchParams.get('points');

    let center: { lat: number; lng: number } | undefined;
    if (centerStr) {
      const [lat, lng] = centerStr.split(',').map(Number);
      if (!isNaN(lat) && !isNaN(lng)) center = { lat, lng };
    }

    const zoom = zoomStr ? parseInt(zoomStr, 10) : undefined;

    const points: { lat: number; lng: number; label?: string }[] = [];
    if (pointsStr) {
      const entries = pointsStr.split(';');
      entries.forEach((entry, idx) => {
        const [lat, lng] = entry.split(',').map(Number);
        if (!isNaN(lat) && !isNaN(lng)) {
          points.push({ lat, lng, label: String(idx + 1) });
        }
      });
    }

    const hereUrl = getHereStaticMapUrl({
      width,
      height,
      format,
      center,
      zoom,
      polyline,
      points,
    });

    const { checkAndIncrementHereQuota } = await import('@/lib/quota/hereQuotaGuard');
    await checkAndIncrementHereQuota('static_map', 1);

    const res = await fetch(hereUrl);
    if (!res.ok) {
      // Fallback SVG if HERE key is missing or quota reached
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <rect width="100%" height="100%" fill="#1e293b"/>
        <text x="50%" y="50%" fill="#94a3b8" font-family="sans-serif" font-size="16" text-anchor="middle" dominant-baseline="middle">
          🗺️ Trip Map Preview (${points.length} stops)
        </text>
      </svg>`;
      return new NextResponse(svg, {
        status: 200,
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    const imageBuffer = await res.arrayBuffer();
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': format === 'jpg' ? 'image/jpeg' : 'image/png',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to render static map image';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
