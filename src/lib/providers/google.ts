/**
 * Google Maps provider — wraps Directions API + Places API v1
 */
import { Waypoint, TripSettings } from '../types';
import { RoutingProvider, RouteResult, RouteLeg, RouteStep, NearbyPlace } from './types';

const API_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!;

// ─── Directions API ──────────────────────────────────────────────────────────

interface GDirectionsStep {
  distance: { value: number };
  duration: { value: number };
  start_location: { lat: number; lng: number };
  end_location: { lat: number; lng: number };
  polyline: { points: string };
}

interface GDirectionsLeg {
  distance: { value: number };
  duration: { value: number };
  duration_in_traffic?: { value: number };
  start_address: string;
  end_address: string;
  start_location: { lat: number; lng: number };
  end_location: { lat: number; lng: number };
  steps: GDirectionsStep[];
}

interface GDirectionsRoute {
  legs: GDirectionsLeg[];
  waypoint_order: number[];
  overview_polyline: { points: string };
}

async function callDirectionsAPI(
  origin: Waypoint,
  destination: Waypoint,
  intermediates: Waypoint[],
  settings: TripSettings
): Promise<GDirectionsRoute> {
  const url = new URL('https://maps.googleapis.com/maps/api/directions/json');

  const toParam = (wp: Waypoint) =>
    wp.placeId ? `place_id:${wp.placeId}` : `${wp.location.lat},${wp.location.lng}`;

  url.searchParams.set('origin', toParam(origin));
  url.searchParams.set('destination', toParam(destination));
  url.searchParams.set('key', API_KEY);
  url.searchParams.set('units', 'metric');

  if (intermediates.length > 0) {
    const wpParam = intermediates.map(toParam).join('|');
    url.searchParams.set('waypoints', `optimize:true|${wpParam}`);
  }

  const avoid: string[] = [];
  if (settings.avoidTolls) avoid.push('tolls');
  if (settings.avoidHighways) avoid.push('highways');
  if (avoid.length > 0) url.searchParams.set('avoid', avoid.join('|'));

  // Pass departure_time for traffic-aware ETAs (requires Directions API with traffic)
  // Use the trip's departure date + checkout time converted to a Unix timestamp.
  // The API only accepts future times; if the date is in the past we omit the param.
  if (settings.useTrafficData && settings.departureDate && settings.checkoutTime) {
    const [h, m] = settings.checkoutTime.split(':').map(Number);
    const departure = new Date(`${settings.departureDate}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
    const nowEpoch = Math.floor(Date.now() / 1000);
    const departureEpoch = Math.floor(departure.getTime() / 1000);
    if (departureEpoch > nowEpoch) {
      url.searchParams.set('departure_time', String(departureEpoch));
      url.searchParams.set('traffic_model', 'best_guess');
    }
  }

  const response = await fetch(url.toString());
  const data = await response.json();

  if (data.status !== 'OK') {
    if (data.status === 'ZERO_RESULTS') {
      throw new Error(
        'No driving route found between the selected places. Make sure all locations are reachable by car.'
      );
    }
    if (data.status === 'NOT_FOUND') {
      throw new Error('One or more locations could not be found. Please check your waypoints and try again.');
    }
    if (data.status === 'MAX_WAYPOINTS_EXCEEDED') {
      throw new Error('Too many waypoints. Google Directions API supports up to 25 waypoints.');
    }
    throw new Error(
      `Directions API error: ${data.status} — ${data.error_message || 'Check your API key and enabled APIs.'}`
    );
  }

  return data.routes[0] as GDirectionsRoute;
}

function normalizeGoogleLeg(leg: GDirectionsLeg): RouteLeg {
  // Prefer traffic-aware duration when available
  const durationSeconds = leg.duration_in_traffic?.value ?? leg.duration.value;
  return {
    distanceMeters: leg.distance.value,
    durationSeconds,
    startAddress: leg.start_address,
    endAddress: leg.end_address,
    startLocation: leg.start_location,
    endLocation: leg.end_location,
    steps: leg.steps.map(
      (s): RouteStep => ({
        distanceMeters: s.distance.value,
        durationSeconds: s.duration.value,
        startLocation: s.start_location,
        endLocation: s.end_location,
        encodedPolyline: s.polyline.points,
      })
    ),
  };
}

// ─── Places API v1 ──────────────────────────────────────────────────────────

function mapPriceLevel(priceLevel?: string): number | undefined {
  if (!priceLevel) return undefined;
  const map: Record<string, number> = {
    PRICE_LEVEL_FREE: 0,
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  return map[priceLevel];
}

// ─── Provider implementation ─────────────────────────────────────────────────

export const googleProvider: RoutingProvider = {
  async getRoute(origin, destination, intermediates, settings): Promise<RouteResult> {
    const route = await callDirectionsAPI(origin, destination, intermediates, settings);
    return {
      legs: route.legs.map(normalizeGoogleLeg),
      waypointOrder: route.waypoint_order || [],
      overviewPolyline: route.overview_polyline.points,
    };
  },

  async searchNearby(location, type, radius, maxResults = 5): Promise<NearbyPlace[]> {
    const url = 'https://places.googleapis.com/v1/places:searchNearby';
    const body = {
      includedTypes: [type],
      maxResultCount: Math.min(maxResults, 20),
      locationRestriction: {
        circle: {
          center: { latitude: location.lat, longitude: location.lng },
          radius,
        },
      },
      rankPreference: 'POPULARITY',
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': API_KEY,
          'X-Goog-FieldMask':
            'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.priceLevel,places.shortFormattedAddress,places.currentOpeningHours,places.photos',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (data.error) return [];

      interface GPlace {
        id?: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        location?: { latitude?: number; longitude?: number };
        rating?: number;
        priceLevel?: string;
        currentOpeningHours?: { openNow?: boolean };
        photos?: Array<{ name?: string }>;
      }
      const publicKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      return (data.places || []).map((place: GPlace): NearbyPlace => ({
        id: place.id || '',
        name: place.displayName?.text || 'Unknown',
        address: place.formattedAddress || '',
        location: {
          lat: place.location?.latitude || 0,
          lng: place.location?.longitude || 0,
        },
        type,
        rating: place.rating,
        priceLevel: mapPriceLevel(place.priceLevel),
        isOpen: place.currentOpeningHours?.openNow,
        // Only include a client-usable photo URL if a browser-restricted key is available.
        photoUrl: place.photos?.[0]?.name && publicKey
          ? `https://places.googleapis.com/v1/${place.photos[0].name}/media?maxWidthPx=200&key=${publicKey}`
          : undefined,
      }));
    } catch {
      return [];
    }
  },
};
