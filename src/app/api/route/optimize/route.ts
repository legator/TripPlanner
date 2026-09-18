import { NextRequest, NextResponse } from 'next/server';
import { DayPlan, DaySegment, TripSettings } from '@/lib/types';
import { callHereWaypointsSequence, hereProvider } from '@/lib/providers/here';

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!;

interface DirectionsLeg {
  distance: { value: number; text: string };
  duration: { value: number; text: string };
  start_address: string;
  end_address: string;
  start_location: { lat: number; lng: number };
  end_location: { lat: number; lng: number };
  steps: Array<{
    distance: { value: number };
    duration: { value: number };
    polyline: { points: string };
  }>;
}

interface DirectionsRoute {
  legs: DirectionsLeg[];
  waypoint_order: number[];
  overview_polyline: { points: string };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { day, settings, provider } = body as {
      day: DayPlan;
      settings: TripSettings;
      provider?: 'google' | 'here';
    };

    if (!day || !day.segments || day.segments.length <= 1) {
      return NextResponse.json({ segments: day?.segments || [] });
    }

    const currentProvider = provider || 'google';

    // Start & End locations
    const startLocation = day.segments[0].startLocation;
    const endLocation = day.segments[day.segments.length - 1].endLocation;
    const intermediateLocations = day.segments.map((seg) => seg.endLocation).slice(0, -1);

    if (currentProvider === 'here') {
      const toWaypoint = (loc: { lat: number; lng: number }, i: number) => ({
        id: `wp_${i}`,
        name: `Waypoint ${i}`,
        address: '',
        location: loc,
      });

      const originWp = toWaypoint(startLocation, 0);
      const destWp = toWaypoint(endLocation, intermediateLocations.length + 1);
      const interWps = intermediateLocations.map((loc, i) => toWaypoint(loc, i + 1));

      const optimizedOrder = await callHereWaypointsSequence(originWp, destWp, interWps, settings);

      if (!optimizedOrder || optimizedOrder.length === 0) {
        return NextResponse.json({ segments: day.segments });
      }

      const newIntermediates = optimizedOrder.map((idx) => interWps[idx]);
      const result = await hereProvider.getRoute(originWp, destWp, newIntermediates, settings);

      const allNames = [
        day.segments[0].startName,
        ...optimizedOrder.map((idx) => day.segments[idx].endName),
        day.segments[day.segments.length - 1].endName,
      ];

      const optimizedSegments: DaySegment[] = [];
      for (let i = 0; i < result.legs.length; i++) {
        const leg = result.legs[i];
        optimizedSegments.push({
          distanceKm: leg.distanceMeters / 1000,
          durationMinutes: Math.round(leg.durationSeconds / 60),
          startName: allNames[i],
          startLocation: leg.startLocation,
          endName: allNames[i + 1],
          endLocation: leg.endLocation,
          polylineSegments: leg.steps.map((s: { encodedPolyline: string }) => s.encodedPolyline),
        });
      }

      return NextResponse.json({ segments: optimizedSegments });
    }

    // Google Directions API Optimization
    const waypoints = [startLocation, ...intermediateLocations, endLocation];
    const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
    url.searchParams.set('key', GOOGLE_MAPS_API_KEY);
    url.searchParams.set('origin', `${waypoints[0].lat},${waypoints[0].lng}`);
    url.searchParams.set('destination', `${waypoints[waypoints.length - 1].lat},${waypoints[waypoints.length - 1].lng}`);

    if (waypoints.length > 2) {
      const intermediates = waypoints.slice(1, -1);
      url.searchParams.set('waypoints', `optimize:true|${intermediates.map((w) => `${w.lat},${w.lng}`).join('|')}`);
    }

    const avoid: string[] = [];
    if (settings?.avoidTolls) avoid.push('tolls');
    if (settings?.avoidHighways) avoid.push('highways');
    if (avoid.length > 0) url.searchParams.set('avoid', avoid.join('|'));

    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.status !== 'OK' || !data.routes?.[0]) {
      console.warn('[api/route/optimize] Directions API error:', data.status, data.error_message);
      return NextResponse.json({ segments: day.segments });
    }

    const route = data.routes[0] as DirectionsRoute;
    const optimizedSegments: DaySegment[] = [];
    const optimizedOrder = route.waypoint_order;

    for (let i = 0; i < optimizedOrder.length; i++) {
      const originalIdx = optimizedOrder[i];
      const leg = route.legs[i];

      const segment: DaySegment = {
        ...day.segments[originalIdx],
        distanceKm: leg.distance.value / 1000,
        durationMinutes: Math.round(leg.duration.value / 60),
        startLocation: leg.start_location,
        endLocation: leg.end_location,
        startName: leg.start_address,
        endName: leg.end_address,
        polylineSegments: leg.steps.map((step) => step.polyline.points),
      };
      optimizedSegments.push(segment);
    }

    return NextResponse.json({ segments: optimizedSegments });
  } catch (error) {
    console.error('[api/route/optimize] Error optimizing route:', error);
    return NextResponse.json({ error: 'Failed to optimize route' }, { status: 500 });
  }
}
