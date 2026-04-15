import { DayPlan, DaySegment, Waypoint, TripSettings } from './types';

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

/**
 * Optimize the route for a specific day using Google Directions API
 * Returns optimized segments in the best order
 */
export async function optimizeDayRoute(
  day: DayPlan,
  settings: TripSettings
): Promise<DaySegment[]> {
  if (day.isRestDay || day.segments.length === 0) {
    return day.segments;
  }

  // If only 1 segment, nothing to optimize
  if (day.segments.length === 1) {
    return day.segments;
  }

  // Build waypoint list: start + all intermediate stops + end
  const startLocation = day.segments[0].startLocation;
  const endLocation = day.segments[day.segments.length - 1].endLocation;
  const intermediateLocations = day.segments.map((seg) => seg.endLocation).slice(0, -1);

  const waypoints = [
    startLocation,
    ...intermediateLocations,
    endLocation,
  ];

  const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
  url.searchParams.set('key', GOOGLE_MAPS_API_KEY);
  url.searchParams.set(
    'origin',
    `${waypoints[0].lat},${waypoints[0].lng}`
  );
  url.searchParams.set(
    'destination',
    `${waypoints[waypoints.length - 1].lat},${waypoints[waypoints.length - 1].lng}`
  );

  // Intermediate waypoints (excluding start and end)
  if (waypoints.length > 2) {
    const intermediates = waypoints.slice(1, -1);
    url.searchParams.set('waypoints', `optimize:true|${intermediates.map((w) => `${w.lat},${w.lng}`).join('|')}`);
  }

  const avoid: string[] = [];
  if (settings.avoidTolls) avoid.push('tolls');
  if (settings.avoidHighways) avoid.push('highways');
  if (avoid.length > 0) url.searchParams.set('avoid', avoid.join('|'));

  console.log('[optimizeDayRoute] Requesting optimization for', day.segments.length, 'segments');

  const response = await fetch(url.toString());
  const data = await response.json();

  if (data.status !== 'OK') {
    console.warn('[optimizeDayRoute] API error:', data.status, data.error_message);
    return day.segments; // Return original segments on error
  }

  console.log('[optimizeDayRoute] Waypoint order:', data.routes[0].waypoint_order);

  // Map the optimized order back to segments
  const route = data.routes[0] as DirectionsRoute;
  const optimizedSegments: DaySegment[] = [];
  const optimizedOrder = route.waypoint_order;

  // Rebuild segments in optimized order
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

  return optimizedSegments;
}
