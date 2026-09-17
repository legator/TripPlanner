import { NextRequest, NextResponse } from 'next/server';
import { callHereMatrix } from '@/lib/providers/here';
import { LatLng } from '@/lib/types';
import { calculateHaversineDistanceKm } from '@/lib/location';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { origins, destinations, transportMode = 'car' } = body as {
      origins: LatLng[];
      destinations: LatLng[];
      transportMode?: string;
    };

    if (!origins || !Array.isArray(origins) || origins.length === 0) {
      return NextResponse.json({ error: 'At least one valid origin required' }, { status: 400 });
    }
    if (!destinations || !Array.isArray(destinations) || destinations.length === 0) {
      return NextResponse.json({ error: 'At least one valid destination required' }, { status: 400 });
    }

    try {
      const matrixResult = await callHereMatrix(origins, destinations, transportMode);
      return NextResponse.json(matrixResult);
    } catch (apiErr: unknown) {
      const apiMsg = apiErr instanceof Error ? apiErr.message : 'Unknown error';
      console.warn('HERE Matrix API call failed, calculating fallback matrix:', apiMsg);

      // Graceful fallback: Haversine distance and approximate driving speeds
      const estSpeedKmh = transportMode === 'truck' ? 70 : transportMode === 'pedestrian' ? 5 : transportMode === 'bicycle' ? 15 : 85;
      const distances: number[] = [];
      const travelTimes: number[] = [];

      for (const org of origins) {
        for (const dest of destinations) {
          const distKm = calculateHaversineDistanceKm(org, dest);
          const distM = Math.round(distKm * 1000);
          const timeSec = Math.round((distKm / estSpeedKmh) * 3600);
          distances.push(distM);
          travelTimes.push(timeSec);
        }
      }

      return NextResponse.json({
        numOrigins: origins.length,
        numDestinations: destinations.length,
        distances,
        travelTimes,
        fallback: true,
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to compute routing matrix';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
