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
import { checkAndIncrementHereQuota } from '../quota/hereQuotaGuard';

const DEFAULT_API_KEY = process.env.HERE_API_KEY || process.env.NEXT_PUBLIC_HERE_API_KEY!;
const API_KEY = DEFAULT_API_KEY;

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
  tolls?: Array<{
    fares?: Array<{ price?: { value: number; currency: string } }>;
    tollSystem?: { fares?: Array<{ price?: { value: number; currency: string } }> };
  }>;
}

function extractSectionTolls(section: HereSection): number {
  if (!section.tolls || !Array.isArray(section.tolls)) return 0;
  let total = 0;
  for (const toll of section.tolls) {
    if (toll.fares && Array.isArray(toll.fares)) {
      for (const f of toll.fares) {
        if (f.price?.value) total += f.price.value;
      }
    }
    if (toll.tollSystem?.fares && Array.isArray(toll.tollSystem.fares)) {
      for (const f of toll.tollSystem.fares) {
        if (f.price?.value) total += f.price.value;
      }
    }
  }
  return Math.round(total * 100) / 100;
}

async function callHereRouting(
  origin: Waypoint,
  destination: Waypoint,
  intermediates: Waypoint[],
  settings: TripSettings,
  apiKey?: string
): Promise<HereSection[]> {
  const activeKey = apiKey?.trim() || DEFAULT_API_KEY;
  const isCustomKey = Boolean(apiKey && apiKey.trim().length > 5);

  if (!isCustomKey) {
    await checkAndIncrementHereQuota('routing', 1);
  }

  const url = new URL('https://router.hereapi.com/v8/routes');
  url.searchParams.set('apiKey', activeKey);
  url.searchParams.set('transportMode', settings.transportMode || 'car');
  url.searchParams.set('return', 'polyline,summary,tolls');
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
    if (response.status === 429) {
      throw new Error(
        'HERE Maps rate limit exceeded (HTTP 429: Too Many Requests). Please wait a moment or switch to Google Maps in settings.'
      );
    }
    if (response.status === 403) {
      throw new Error(
        `HERE Maps API quota or permission error (HTTP 403: ${notice}). Quota may be exhausted. You can switch to Google Maps in settings.`
      );
    }
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
    tollCost: extractSectionTolls(section),
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

  await checkAndIncrementHereQuota('routing', 1);

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
  const orderedIds = waypoints.slice(1, -1).map((wp: { id: string }) => wp.id);

  const order = orderedIds.map((id: string) => parseInt(id.replace('wp', ''), 10));
  return order;
}

// ─── HERE Isoline Routing API ────────────────────────────────────────────────

export async function callHereIsoline(
  lat: number,
  lng: number,
  rangeMins: number,
  transportMode: string = 'car'
): Promise<{ lat: number; lng: number }[]> {
  await checkAndIncrementHereQuota('isoline', 1);

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
  cafe: '100-1100',
  rest_stop: '700-7900-0140,400-4000-4270,300-3000',
  parking: '800-8500-0178',
  rest_area: '700-7900-0140',
};

export interface HereParkingPlace {
  id: string;
  name: string;
  address: string;
  location: { lat: number; lng: number };
  distanceMeters?: number;
  isOpen?: boolean;
  facilityType?: 'garage' | 'lot' | 'underground' | 'rest_area' | 'park_and_ride' | 'street';
  isHighwayRestStop?: boolean;
  totalCapacity?: number;
  availableSpots?: number;
}

export async function fetchHereParking(
  location: { lat: number; lng: number },
  radius: number = 3000,
  isHighway: boolean = false,
  query?: string,
  apiKey?: string
): Promise<HereParkingPlace[]> {
  try {
    const activeKey = apiKey?.trim() || DEFAULT_API_KEY;
    const isCustomKey = Boolean(apiKey && apiKey.trim().length > 5);

    if (!isCustomKey) {
      await checkAndIncrementHereQuota('search', 1);
    }

    let url: URL;
    if (query && query.trim().length > 0) {
      url = new URL('https://discover.search.hereapi.com/v1/discover');
      url.searchParams.set('apiKey', activeKey);
      url.searchParams.set('at', `${location.lat},${location.lng}`);
      url.searchParams.set('q', query.trim());
      url.searchParams.set('limit', '15');
    } else if (isHighway) {
      // Highway Rest Areas and Motorway Service Stations
      url = new URL('https://browse.search.hereapi.com/v1/browse');
      url.searchParams.set('apiKey', activeKey);
      url.searchParams.set('at', `${location.lat},${location.lng}`);
      url.searchParams.set('categories', '700-7900-0140,800-8500-0178,700-7600-0116');
      url.searchParams.set('limit', '15');
      url.searchParams.set('radius', String(radius));
    } else {
      // City Parking Garages and Lots
      url = new URL('https://browse.search.hereapi.com/v1/browse');
      url.searchParams.set('apiKey', activeKey);
      url.searchParams.set('at', `${location.lat},${location.lng}`);
      url.searchParams.set('categories', '800-8500-0178');
      url.searchParams.set('limit', '15');
      url.searchParams.set('radius', String(radius));
    }

    const response = await fetch(url.toString());
    const data = await response.json();
    if (!response.ok || !data.items || !Array.isArray(data.items)) {
      return [];
    }

    interface HCategory {
      id?: string;
      name?: string;
    }

    interface HPlaceItem {
      id?: string;
      title?: string;
      address?: { label?: string };
      position?: { lat?: number; lng?: number };
      distance?: number;
      openingHours?: Array<{ isOpen?: boolean }>;
      categories?: HCategory[];
    }

    return (data.items as HPlaceItem[]).map((item) => {
      const catIds = (item.categories || []).map((c) => c.id || '');
      const catNames = (item.categories || []).map((c) => (c.name || '').toLowerCase()).join(' ');
      const titleLower = (item.title || '').toLowerCase();

      let facilityType: HereParkingPlace['facilityType'] = 'lot';
      let isRestStop = isHighway;

      if (
        catIds.some((id) => id.startsWith('700-7900')) ||
        titleLower.includes('rast') ||
        titleLower.includes('autohof') ||
        titleLower.includes('aire de') ||
        titleLower.includes('rest area') ||
        titleLower.includes('service')
      ) {
        facilityType = 'rest_area';
        isRestStop = true;
      } else if (
        catIds.includes('800-8500-0179') ||
        titleLower.includes('garage') ||
        titleLower.includes('parkhaus') ||
        catNames.includes('garage') ||
        catNames.includes('parkhaus')
      ) {
        facilityType = 'garage';
      } else if (
        titleLower.includes('tiefgarage') ||
        catNames.includes('underground')
      ) {
        facilityType = 'underground';
      } else if (
        catIds.includes('800-8500-0181') ||
        titleLower.includes('park and ride') ||
        titleLower.includes('p+r') ||
        titleLower.includes('p & r')
      ) {
        facilityType = 'park_and_ride';
      }

      return {
        id: item.id || `here-prk-${Math.random()}`,
        name: item.title || 'Parking Facility',
        address: item.address?.label || '',
        location: {
          lat: item.position?.lat || location.lat,
          lng: item.position?.lng || location.lng,
        },
        distanceMeters: item.distance,
        isOpen: item.openingHours?.[0]?.isOpen,
        facilityType,
        isHighwayRestStop: isRestStop,
      };
    });
  } catch (err) {
    console.warn('fetchHereParking error:', err);
    return [];
  }
}

async function callHereBrowse(
  location: { lat: number; lng: number },
  type: string,
  radius: number,
  maxResults: number,
  apiKey?: string
): Promise<NearbyPlace[]> {
  const categoryId = HERE_CATEGORIES[type];
  if (!categoryId) return [];

  const activeKey = apiKey?.trim() || DEFAULT_API_KEY;
  const isCustomKey = Boolean(apiKey && apiKey.trim().length > 5);

  if (!isCustomKey) {
    await checkAndIncrementHereQuota('search', 1);
  }

  const url = new URL('https://browse.search.hereapi.com/v1/browse');
  url.searchParams.set('apiKey', activeKey);
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

export function createHereProvider(apiKeyOverride?: string): RoutingProvider {
  return {
    async getRoute(origin, destination, intermediates, settings): Promise<RouteResult> {
      const sections = await callHereRouting(origin, destination, intermediates, settings, apiKeyOverride);

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
      return callHereBrowse(location, type, radius, maxResults, apiKeyOverride);
    },
  };
}

export const hereProvider: RoutingProvider = createHereProvider();


// ─── HERE Matrix Routing API v8 ──────────────────────────────────────────────

export interface HereMatrixResult {
  numOrigins: number;
  numDestinations: number;
  distances: number[];    // meters
  travelTimes: number[];  // seconds
  errorCodes?: number[];
}

export async function callHereMatrix(
  origins: { lat: number; lng: number }[],
  destinations: { lat: number; lng: number }[],
  transportMode: string = 'car'
): Promise<HereMatrixResult> {
  const elementsCount = Math.max(1, origins.length * destinations.length);
  await checkAndIncrementHereQuota('matrix', elementsCount);

  const url = new URL('https://matrix.router.hereapi.com/v8/matrix');
  url.searchParams.set('apiKey', API_KEY);
  url.searchParams.set('async', 'false');

  const profileMap: Record<string, string> = {
    truck: 'truckFast',
    pedestrian: 'pedestrian',
    bicycle: 'bicycle',
  };
  const profile = profileMap[transportMode] || 'carFast';

  const body = {
    origins: origins.map((p) => ({ lat: p.lat, lng: p.lng })),
    destinations: destinations.map((p) => ({ lat: p.lat, lng: p.lng })),
    profile,
    matrixAttributes: ['distances', 'travelTimes'],
  };

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HERE Matrix API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  const matrix = data.matrix || data;
  return {
    numOrigins: matrix.numOrigins || origins.length,
    numDestinations: matrix.numDestinations || destinations.length,
    distances: matrix.distances || [],
    travelTimes: matrix.travelTimes || [],
    errorCodes: matrix.errorCodes,
  };
}

// ─── HERE Map Image API v3 ───────────────────────────────────────────────────

export interface HereStaticMapOptions {
  width?: number;
  height?: number;
  format?: 'png' | 'jpg';
  center?: { lat: number; lng: number };
  zoom?: number;
  polyline?: string;
  points?: { lat: number; lng: number; label?: string }[];
}

export function getHereStaticMapUrl(options: HereStaticMapOptions): string {
  const url = new URL('https://image.maps.hereapi.com/v3/render');
  url.searchParams.set('apiKey', API_KEY);
  url.searchParams.set('w', String(options.width || 800));
  url.searchParams.set('h', String(options.height || 500));
  url.searchParams.set('f', options.format === 'jpg' ? '0' : '1');

  if (options.center) {
    url.searchParams.set('c', `${options.center.lat},${options.center.lng}`);
    if (options.zoom) url.searchParams.set('z', String(options.zoom));
  }

  if (options.polyline) {
    url.searchParams.set('r0', options.polyline);
  }

  if (options.points && options.points.length > 0) {
    options.points.slice(0, 10).forEach((pt, i) => {
      url.searchParams.append('poi', `${pt.lat},${pt.lng};white;blue;14;${pt.label || i + 1}`);
    });
  }

  return url.toString();
}

// ─── HERE Traffic Flow API v7 ────────────────────────────────────────────────

export interface HereTrafficFlowItem {
  speedKmh: number;
  freeFlowSpeedKmh: number;
  jamFactor: number; // 0.0 (free flow) to 10.0 (stationary)
  confidence: number;
}

export async function fetchHereTrafficFlow(
  corridorPolyline: string,
  radiusMeters: number = 300
): Promise<HereTrafficFlowItem[]> {
  await checkAndIncrementHereQuota('traffic', 1);

  const url = new URL('https://data.traffic.hereapi.com/v7/flow');
  url.searchParams.set('apiKey', API_KEY);
  url.searchParams.set('in', `corridor:${corridorPolyline};r=${radiusMeters}`);
  url.searchParams.set('locationReferencing', 'shape');

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.results || !Array.isArray(data.results)) return [];

    interface RawFlowItem {
      currentFlow?: {
        speed?: number;
        freeFlow?: number;
        jamFactor?: number;
        confidence?: number;
      };
    }

    return (data.results as RawFlowItem[]).map((r) => {
      const flow = r.currentFlow || {};
      return {
        speedKmh: flow.speed != null ? Math.round(flow.speed * 3.6) : 0,
        freeFlowSpeedKmh: flow.freeFlow != null ? Math.round(flow.freeFlow * 3.6) : 0,
        jamFactor: flow.jamFactor != null ? Math.round(flow.jamFactor * 10) / 10 : 0,
        confidence: flow.confidence ?? 1.0,
      };
    });
  } catch (err) {
    console.warn('HERE Traffic Flow fetch failed:', err);
    return [];
  }
}
