import { NextRequest, NextResponse } from 'next/server';
import { encode as encodeFlexPolyline } from '@here/flexpolyline';
import { decodePolyline } from '@/lib/tripGpxExport';
import { TrafficIncident } from '@/lib/types';

const HERE_API_KEY = process.env.HERE_API_KEY || process.env.NEXT_PUBLIC_HERE_API_KEY || '';

interface RawHereIncident {
  location?: {
    length?: number;
    shape?: {
      links?: Array<{
        points?: Array<{ lat: number; lng: number }>;
        length?: number;
      }>;
    };
  };
  incidentDetails?: {
    id?: string;
    type?: string;
    criticality?: 'critical' | 'major' | 'minor' | 'lowImpact';
    roadClosed?: boolean;
    startTime?: string;
    endTime?: string;
    description?: { value?: string };
    summary?: { value?: string };
    typeDescription?: { value?: string };
  };
}

function normalizeType(type?: string, roadClosed?: boolean): TrafficIncident['type'] {
  if (roadClosed || type === 'roadClosure') return 'roadClosure';
  if (type === 'construction' || type === 'roadwork') return 'roadwork';
  if (type === 'accident') return 'accident';
  if (type === 'congestion') return 'congestion';
  if (type === 'hazard') return 'hazard';
  return 'other';
}

function criticalityScore(c?: string): number {
  switch (c) {
    case 'critical':
      return 4;
    case 'major':
      return 3;
    case 'minor':
      return 2;
    default:
      return 1;
  }
}

function getPolylineDistance(points: Array<{ lat: number; lng: number }>): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const lat1 = (points[i].lat * Math.PI) / 180;
    const lat2 = (points[i + 1].lat * Math.PI) / 180;
    const dLat = lat2 - lat1;
    const dLng = ((points[i + 1].lng - points[i].lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    total += 6371000 * c;
  }
  return total;
}

function chunkPointsByDistance(
  points: Array<{ lat: number; lng: number }>,
  maxChunkMeters: number
): Array<Array<{ lat: number; lng: number }>> {
  const chunks: Array<Array<{ lat: number; lng: number }>> = [];
  let currentChunk: Array<{ lat: number; lng: number }> = [points[0]];
  let currentDist = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const lat1 = (p1.lat * Math.PI) / 180;
    const lat2 = (p2.lat * Math.PI) / 180;
    const dLat = lat2 - lat1;
    const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const stepDist = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    if (currentDist + stepDist > maxChunkMeters && currentChunk.length >= 2) {
      chunks.push(currentChunk);
      currentChunk = [p1, p2];
      currentDist = stepDist;
    } else {
      currentChunk.push(p2);
      currentDist += stepDist;
    }
  }

  if (currentChunk.length >= 2) {
    chunks.push(currentChunk);
  }

  return chunks;
}

export async function GET(request: NextRequest) {
  if (!HERE_API_KEY) {
    return NextResponse.json(
      { error: 'HERE API key is not configured' },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const corridor = searchParams.get('corridor');
  const latStr = searchParams.get('lat');
  const lngStr = searchParams.get('lng');
  const radiusStr = searchParams.get('radius');
  const bbox = searchParams.get('bbox');
  const limitStr = searchParams.get('limit');
  const limit = limitStr ? Math.min(Math.max(1, parseInt(limitStr, 10)), 150) : 50;

  const inFilters: string[] = [];

  if (corridor) {
    try {
      const points = decodePolyline(corridor);
      if (points.length < 2) {
        return NextResponse.json(
          { error: 'Corridor polyline must contain at least 2 points' },
          { status: 400 }
        );
      }

      const radius = radiusStr ? parseInt(radiusStr, 10) : 150;
      const safeRadius = Math.min(Math.max(radius, 50), 5000);
      const totalDist = getPolylineDistance(points);

      // HERE Traffic API v7 restricts corridor length to 500km max.
      // Split routes longer than 400km into multiple sub-corridors (max 3).
      const pointChunks = totalDist > 400000
        ? chunkPointsByDistance(points, 400000).slice(0, 3)
        : [points];

      for (const chunk of pointChunks) {
        const maxSamplePoints = 100;
        let sampled = chunk;
        if (chunk.length > maxSamplePoints) {
          const step = Math.ceil(chunk.length / maxSamplePoints);
          sampled = chunk.filter((_, i) => i % step === 0 || i === chunk.length - 1);
        }

        const flexPoly = encodeFlexPolyline({
          polyline: sampled.map((p) => [p.lat, p.lng]),
        });

        inFilters.push(`corridor:${flexPoly};r=${safeRadius}`);
      }
    } catch (err) {
      console.error('Error encoding corridor for HERE Traffic:', err);
      return NextResponse.json(
        { error: 'Invalid corridor polyline' },
        { status: 400 }
      );
    }
  } else if (latStr && lngStr) {
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    if (isNaN(lat) || isNaN(lng)) {
      return NextResponse.json(
        { error: 'Invalid lat or lng coordinate' },
        { status: 400 }
      );
    }
    const radius = radiusStr ? parseInt(radiusStr, 10) : 15000;
    inFilters.push(`circle:${lat.toFixed(5)},${lng.toFixed(5)};r=${Math.min(Math.max(radius, 500), 50000)}`);
  } else if (bbox) {
    inFilters.push(`boundingbox:${bbox}`);
  } else {
    return NextResponse.json(
      { error: 'Please specify corridor, lat/lng, or bbox' },
      { status: 400 }
    );
  }

  try {
    const rawResults: RawHereIncident[] = [];
    let sourceUpdated: string | undefined;

    await Promise.all(
      inFilters.map(async (filter) => {
        const url = new URL('https://data.traffic.hereapi.com/v7/incidents');
        url.searchParams.set('in', filter);
        url.searchParams.set('locationReferencing', 'shape');
        url.searchParams.set('lang', 'en');
        url.searchParams.set('apiKey', HERE_API_KEY);

        try {
          const res = await fetch(url.toString(), {
            next: { revalidate: 60 },
          });
          if (res.ok) {
            const data = await res.json();
            if (data.results && Array.isArray(data.results)) {
              rawResults.push(...data.results);
            }
            if (data.sourceUpdated) {
              sourceUpdated = data.sourceUpdated;
            }
          } else {
            console.warn('HERE Traffic API v7 partial error:', res.status, await res.text());
          }
        } catch (err) {
          console.warn('HERE Traffic sub-request failed:', err);
        }
      })
    );

    const incidents: TrafficIncident[] = [];
    const seenIds = new Set<string>();

    for (const r of rawResults) {
      const details = r.incidentDetails;
      const firstCoord = r.location?.shape?.links?.[0]?.points?.[0];
      if (!details || !firstCoord) continue;

      const id = details.id || `${firstCoord.lat}_${firstCoord.lng}_${details.type}`;
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      const type = normalizeType(details.type, details.roadClosed);
      const summary = details.summary?.value || details.description?.value || details.typeDescription?.value || 'Traffic Alert';
      const description = details.description?.value || summary;

      incidents.push({
        id,
        type,
        criticality: details.criticality || 'minor',
        roadClosed: Boolean(details.roadClosed),
        description,
        summary,
        location: {
          lat: firstCoord.lat,
          lng: firstCoord.lng,
        },
        lengthMeters: r.location?.length,
        startTime: details.startTime,
        endTime: details.endTime,
      });
    }

    // Sort by criticality priority (critical > major > minor > lowImpact)
    incidents.sort((a, b) => criticalityScore(b.criticality) - criticalityScore(a.criticality));

    const finalIncidents = incidents.slice(0, limit);

    return NextResponse.json({
      incidents: finalIncidents,
      total: incidents.length,
      sourceUpdated: sourceUpdated,
    });
  } catch (error) {
    console.error('Failed to fetch HERE traffic incidents:', error);
    return NextResponse.json(
      { incidents: [], total: 0, error: 'Failed to fetch traffic incidents' },
      { status: 500 }
    );
  }
}
