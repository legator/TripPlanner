import { Waypoint, TripSettings } from '../types';

// ─── Normalized route types ──────────────────────────────────────────────────

export interface RouteStep {
  distanceMeters: number;
  durationSeconds: number;
  startLocation: { lat: number; lng: number };
  endLocation: { lat: number; lng: number };
  /** Google-encoded polyline string */
  encodedPolyline: string;
}

export interface RouteLeg {
  distanceMeters: number;
  durationSeconds: number;
  startAddress: string;
  endAddress: string;
  startLocation: { lat: number; lng: number };
  endLocation: { lat: number; lng: number };
  steps: RouteStep[];
}

export interface RouteResult {
  legs: RouteLeg[];
  /** Optimized intermediate waypoint order indices (relative to intermediates array) */
  waypointOrder: number[];
  /** Google-encoded overview polyline */
  overviewPolyline: string;
}

// ─── Normalized place types ──────────────────────────────────────────────────

export interface NearbyPlace {
  id: string;
  name: string;
  address: string;
  location: { lat: number; lng: number };
  /** Provider-specific type string (e.g. "lodging", "gas_station") */
  type: string;
  rating?: number;
  priceLevel?: number;
  isOpen?: boolean;
  photoUrl?: string;
}

// ─── Provider interface ──────────────────────────────────────────────────────

export interface RoutingProvider {
  getRoute(
    origin: Waypoint,
    destination: Waypoint,
    intermediates: Waypoint[],
    settings: TripSettings
  ): Promise<RouteResult>;

  searchNearby(
    location: { lat: number; lng: number },
    type: string,
    radius: number,
    maxResults?: number
  ): Promise<NearbyPlace[]>;
}
