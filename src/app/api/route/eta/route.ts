import { NextRequest, NextResponse } from 'next/server';
import { getRoutingProvider, MapProviderName } from '@/lib/providers';
import { RouteLeg } from '@/lib/providers/types';
import { Waypoint, LatLng } from '@/lib/types';
import { DEFAULT_SETTINGS } from '@/lib/constants';
import { calculateHaversineDistanceKm } from '@/lib/location';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { origin, destination, provider } = body as {
      origin: LatLng;
      destination: LatLng;
      provider?: MapProviderName;
    };

    if (!origin || !destination || isNaN(origin.lat) || isNaN(origin.lng) || isNaN(destination.lat) || isNaN(destination.lng)) {
      return NextResponse.json({ error: 'Valid origin and destination coordinates required' }, { status: 400 });
    }

    const originWp: Waypoint = {
      id: 'origin',
      name: 'Current Position',
      location: origin,
      address: `${origin.lat.toFixed(4)}, ${origin.lng.toFixed(4)}`,
    };

    const destWp: Waypoint = {
      id: 'destination',
      name: 'Target Stop',
      location: destination,
      address: `${destination.lat.toFixed(4)}, ${destination.lng.toFixed(4)}`,
    };

    const routingProvider = getRoutingProvider(provider);
    const routeSettings = {
      ...DEFAULT_SETTINGS,
      useTrafficData: true,
      departureDate: new Date().toISOString(),
    };

    try {
      const result = await routingProvider.getRoute(originWp, destWp, [], routeSettings);
      if (result.legs && result.legs.length > 0) {
        const totalDurationSec = result.legs.reduce((acc: number, leg: RouteLeg) => acc + leg.durationSeconds, 0);
        const totalDistanceMeters = result.legs.reduce((acc: number, leg: RouteLeg) => acc + leg.distanceMeters, 0);

        const durationMinutes = Math.max(1, Math.round(totalDurationSec / 60));
        const distanceKm = Math.round((totalDistanceMeters / 1000) * 10) / 10;

        // Approximate free-flow vs traffic comparison
        const haversineDist = calculateHaversineDistanceKm(origin, destination);
        const freeFlowMinutes = Math.max(1, Math.round((haversineDist / 80) * 60));
        const trafficDelayMinutes = Math.max(0, durationMinutes - freeFlowMinutes);

        const arrivalDate = new Date(Date.now() + durationMinutes * 60000);
        const etaArrivalTime = arrivalDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

        return NextResponse.json({
          durationMinutes,
          distanceKm,
          trafficDelayMinutes,
          etaArrivalTime,
          hasLiveTraffic: true,
        });
      }
    } catch (routeErr) {
      console.warn('Routing provider ETA query error, using fallback:', routeErr);
    }

    // Fallback if routing provider temporarily fails or rate limited
    const straightDistKm = calculateHaversineDistanceKm(origin, destination);
    const estRoadDistKm = Math.round(straightDistKm * 1.25 * 10) / 10;
    const estDurationMinutes = Math.max(1, Math.round((estRoadDistKm / 65) * 60));
    const fallbackArrival = new Date(Date.now() + estDurationMinutes * 60000);

    return NextResponse.json({
      durationMinutes: estDurationMinutes,
      distanceKm: estRoadDistKm,
      trafficDelayMinutes: 0,
      etaArrivalTime: fallbackArrival.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      hasLiveTraffic: false,
    });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
