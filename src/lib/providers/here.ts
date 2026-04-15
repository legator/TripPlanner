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

const API_KEY = process.env.HERE_API_KEY!;

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
  url.searchParams.set('transportMode', 'car');
  url.searchParams.set('return', 'polyline,summary');
  url.searchParams.set('origin', `${origin.location.lat},${origin.location.lng}`);
  url.searchParams.set('destination', `${destination.location.lat},${destination.location.lng}`);

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

function hereSectionToRouteLeg(section: HereSection, startAddress: string, endAddress: string): RouteLeg {
  const { polyline: decoded } = decodeFlexPolyline(section.polyline);
  const points = decoded as [number, number][];

  // Split into "steps" — for HERE we create a single step per section
  // (no step-level detail in the basic polyline return)
  const googleEncoded = encodeGooglePolyline(points);

  const step: RouteStep = {
    distanceMeters: section.summary.length,
    durationSeconds: section.summary.duration,
    startLocation: section.departure.place.location,
    endLocation: section.arrival.place.location,
    encodedPolyline: googleEncoded,
  };

  return {
    distanceMeters: section.summary.length,
    durationSeconds: section.summary.duration,
    startAddress,
    endAddress,
    startLocation: section.departure.place.location,
    endLocation: section.arrival.place.location,
    steps: [step],
  };
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

    return data.items.map((item: any): NearbyPlace => ({
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
