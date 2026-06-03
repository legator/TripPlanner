/**
 * HERE Maps provider — wraps HERE Routing API v8 + HERE Browse API
 *
 * Routing notes:
 *  - HERE Routing API v8 does NOT have a simple "optimize waypoint order" flag.
 *    Waypoints are routed in the user-specified order.
 *  - HERE uses "Flexible Polyline" encoding; we decode it server-side and
 *    re-encode as Google encoding so the rest of the system (MapView, GPX, KML)
 *    works unchanged.
 */
import { decode as decodeFlexPolyline } from '@here/flexpolyline';
import { Waypoint, TripSettings } from '../types';
import { RoutingProvider, RouteResult, RouteLeg, RouteStep, NearbyPlace } from './types';

import { RoutingProvider, RouteResult, RouteLeg, RouteStep, NearbyPlace } from './types';

const API_KEY = process.env.HERE_API_KEY || process.env.NEXT_PUBLIC_HERE_API_KEY!;

// ─── Google Polyline encoder (needed to re-encode HERE flexible polylines) ───

function encodeGooglePolyline(points: [number, number][]): string {
  let prevLat = 0;
  let prevLng = 0;
  let result = '';

  const encode = (value: number): string => {
    let v = Math.round(value * 1e5);
    v = v < 0 ? ~(v << 1) : v << 1;
    let encoded = '';
    while (v >= 0x20) {
      encoded += String.fromCharCode(((0x20 | (v & 0x1f)) + 63));
      v >>= 5;
    }
    encoded += String.fromCharCode(v + 63);
    return encoded;
  };

  for (const [lat, lng] of points) {
    result += encode(lat - prevLat);
    result += encode(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return result;
}

// ─── HERE Routing API v8 ─────────────────────────────────────────────────────

interface HereSection {
  id: string;
  type: string;
  departure: {
    place: { location: { lat: number; lng: number } };
    time: string;
  };
  arrival: {
    place: { location: { lat: number; lng: number } };
    time: string;
  };
  summary: {
    length: number;   // meters
    duration: number; // seconds
  };
  polyline: string; // HERE Flexible Polyline
}

async function callHereRouting(
  origin: Waypoint,
  destination: Waypoint,
  intermediates: Waypoint[],
  settings: TripSettings
): Promise<HereSection[]> {
  const url = new URL('https://router.hereapi.com/v8/routes');
  url.searchParams.set('apiKey', API_KEY);
  url.searchParams.set('transportMode', settings.transportMode || 'car');
  url.searchParams.set('return', 'polyline,summary');
  url.searchParams.set('origin', `${origin.location.lat},${origin.location.lng}`);
  url.searchParams.set('destination', `${destination.location.lat},${destination.location.lng}`);

  if (settings.useTrafficData && (settings.transportMode === 'car' || settings.transportMode === 'truck' || !settings.transportMode)) {
    url.searchParams.set('departureTime', 'any');
  }

  for (const wp of intermediates) {
    url.searchParams.append('via', `${wp.location.lat},${wp.location.lng}`);
  }

  const avoid: string[] = [];
  if (settings.avoidTolls) avoid.push('tollRoad');
  if (settings.avoidHighways) avoid.push('controlledAccessHighway');
  if (avoid.length > 0) url.searchParams.set('avoid[features]', avoid.join(','));

  const response = await fetch(url.toString());
  const data = await response.json();

  if (!response.ok || !data.routes?.[0]) {
    const notice = data.notices?.[0]?.title || data.title || 'Unknown error';
    if (response.status === 404 || notice.toLowerCase().includes('no route')) {
      throw new Error('No driving route found between the selected places.');
    }
    throw new Error(`HERE Routing error: ${notice}`);
  }

  return data.routes[0].sections as HereSection[];
}

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function hereSectionToRouteLeg(section: HereSection, startAddress: string, endAddress: string): RouteLeg {
  const { polyline: decoded } = decodeFlexPolyline(section.polyline);
  const points = decoded as [number, number][];

  // We chunk the single section into ~20km steps to allow `splitLegBySteps` 
  // in tripPlanner to correctly enforce max distance/duration limits.
  const CHUNK_SIZE_M = 20000;
  const numSteps = Math.max(1, Math.ceil(section.summary.length / CHUNK_SIZE_M));
  const pointsPerStep = Math.ceil(points.length / numSteps);
  const distPerStep = section.summary.length / numSteps;
  const durPerStep = section.summary.duration / numSteps;

  const steps: RouteStep[] = [];
  for (let i = 0; i < numSteps; i++) {
    const startIdx = i * pointsPerStep;
    let endIdx = (i + 1) * pointsPerStep;
    if (i === numSteps - 1 || endIdx >= points.length) {
      endIdx = points.length - 1;
    }

    const chunkPoints = points.slice(startIdx, endIdx + 1);
    if (chunkPoints.length < 2) continue;

    steps.push({
      distanceMeters: distPerStep,
      durationSeconds: durPerStep,
      startLocation: { lat: chunkPoints[0][0], lng: chunkPoints[0][1] },
      endLocation: { lat: chunkPoints[chunkPoints.length - 1][0], lng: chunkPoints[chunkPoints.length - 1][1] },
      encodedPolyline: encodeGooglePolyline(chunkPoints),
    });
  }

  return {
    distanceMeters: section.summary.length,
    durationSeconds: section.summary.duration,
    startAddress,
    endAddress,
    startLocation: section.departure.place.location,
    endLocation: section.arrival.place.location,
    steps,
    steps,
  };
}

// ─── HERE Waypoints Sequence API ───────────────────────────────────────────────

export async function callHereWaypointsSequence(
  origin: Waypoint,
  destination: Waypoint,
  intermediates: Waypoint[],
  settings: TripSettings
): Promise<number[]> {
  if (intermediates.length === 0) return [];

  const url = new URL('https://wse.router.hereapi.com/v8/sequences');
  url.searchParams.set('apiKey', API_KEY);

  // Start and end are fixed
  url.searchParams.set('start', `start;${origin.location.lat},${origin.location.lng}`);
  url.searchParams.set('end', `end;${destination.location.lat},${destination.location.lng}`);

  for (let i = 0; i < intermediates.length; i++) {
    const wp = intermediates[i];
    url.searchParams.append('destination', `wp${i};${wp.location.lat},${wp.location.lng}`);
  }

  url.searchParams.set('mode', `fastest;${settings.transportMode || 'car'}`);

  const response = await fetch(url.toString());
  const data = await response.json();

  if (!response.ok || !data.results || data.results.length === 0) {
    console.warn('HERE Waypoints Sequence failed:', data);
    return intermediates.map((_, i) => i); // return original order on failure
  }

  const waypoints = data.results[0].waypoints;
  // Extract intermediate order (skip first and last which are start/end)
  const orderedIds = waypoints.slice(1, -1).map((wp: any) => wp.id as string);

  const order = orderedIds.map(id => parseInt(id.replace('wp', ''), 10));
  return order;
}

// ─── HERE Isoline Routing API ────────────────────────────────────────────────

export async function callHereIsoline(
  lat: number,
  lng: number,
  rangeMins: number,
  transportMode: string = 'car'
): Promise<{ lat: number; lng: number }[]> {
  const url = new URL('https://isoline.router.hereapi.com/v8/calculateroute');
  url.searchParams.set('apiKey', API_KEY);
  url.searchParams.set('transportMode', transportMode);
  url.searchParams.set('origin', `${lat},${lng}`);
  url.searchParams.set('range[type]', 'time');
  url.searchParams.set('range[values]', String(rangeMins * 60)); // seconds
  url.searchParams.set('shape[maxPoints]', '100'); // reasonable fidelity

  try {
    const response = await fetch(url.toString());
    const data = await response.json();
    if (!response.ok || !data.isolines?.[0]) return [];

    const polylineEncoded = data.isolines[0].polygons[0].outer;
    const { polyline: decoded } = decodeFlexPolyline(polylineEncoded);
    return (decoded as [number, number][]).map(([lat, lng]) => ({ lat, lng }));
  } catch (err) {
    console.error('Isoline error:', err);
    return [];
  }
}

// ─── HERE Browse API ─────────────────────────────────────────────────────────

/**
 * Maps provider-neutral type strings to HERE category IDs.
 * https://developer.here.com/documentation/geocoding-search-api/dev_guide/topics/place-categories/places-category-system-full.html
 */
const HERE_CATEGORIES: Record<string, string> = {
  lodging: '500-5100-0057',
  gas_station: '700-7600-0116',
  electric_vehicle_charging_station: '700-7600-0322',
  tourist_attraction: '300-3000',
  restaurant: '100-1000',
  campground: '400-4300-0266',
};

async function callHereBrowse(
  location: { lat: number; lng: number },
  type: string,
  radius: number,
  maxResults: number
): Promise<NearbyPlace[]> {
  const categoryId = HERE_CATEGORIES[type];
  if (!categoryId) return [];

  const url = new URL('https://browse.search.hereapi.com/v1/browse');
  url.searchParams.set('apiKey', API_KEY);
  url.searchParams.set('at', `${location.lat},${location.lng}`);
  url.searchParams.set('categories', categoryId);
  url.searchParams.set('limit', String(Math.min(maxResults, 20)));
  url.searchParams.set('radius', String(radius));

  try {
    const response = await fetch(url.toString());
    const data = await response.json();
    if (!response.ok || !data.items) return [];

    interface HPlace {
      id?: string;
      title?: string;
      address?: { label?: string };
      position?: { lat?: number; lng?: number };
      averageRating?: number;
      openingHours?: Array<{ isOpen?: boolean }>;
    }
    return data.items.map((item: HPlace): NearbyPlace => ({
      id: item.id || '',
      name: item.title || 'Unknown',
      address: item.address?.label || '',
      location: {
        lat: item.position?.lat || 0,
        lng: item.position?.lng || 0,
      },
      type,
      rating: item.averageRating,
      priceLevel: undefined,
      isOpen: item.openingHours?.[0]?.isOpen,
      photoUrl: undefined,
    }));
  } catch {
    return [];
  }
}

// ─── Provider implementation ─────────────────────────────────────────────────

export const hereProvider: RoutingProvider = {
  async getRoute(origin, destination, intermediates, settings): Promise<RouteResult> {
    const sections = await callHereRouting(origin, destination, intermediates, settings);

    // Build address labels from waypoints (HERE doesn't return address strings)
    const allWaypoints = [origin, ...intermediates, destination];
    const legs: RouteLeg[] = sections.map((section, i) => {
      const startLabel = allWaypoints[i]?.name || `Stop ${i + 1}`;
      const endLabel = allWaypoints[i + 1]?.name || `Stop ${i + 2}`;
      return hereSectionToRouteLeg(section, startLabel, endLabel);
    });

    // Build overview polyline from all section polylines combined
    const allPoints: [number, number][] = [];
    for (const section of sections) {
      const { polyline } = decodeFlexPolyline(section.polyline);
      allPoints.push(...(polyline as [number, number][]));
    }
    const overviewPolyline = encodeGooglePolyline(allPoints);

    // HERE doesn't optimize waypoint order — return identity order
    const waypointOrder = intermediates.map((_, i) => i);

    return { legs, waypointOrder, overviewPolyline };
  },

  async searchNearby(location, type, radius, maxResults = 5): Promise<NearbyPlace[]> {
    return callHereBrowse(location, type, radius, maxResults);
  },
};
