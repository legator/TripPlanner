import { Waypoint } from './types';

export class GeolocationError extends Error {
  code?: number;
  constructor(message: string, code?: number) {
    super(message);
    this.name = 'GeolocationError';
    this.code = code;
  }
}

export interface LiveDrivingPosition {
  lat: number;
  lng: number;
  accuracy?: number;
  heading: number | null;
  speed: number | null; // meters per second
  altitude: number | null;
  timestamp: number;
}

/**
 * Prompts user for browser geolocation permission and returns their coordinates.
 */
export async function getCurrentCoordinates(
  options: PositionOptions = {
    enableHighAccuracy: true,
    timeout: 12000,
    maximumAge: 30000,
  }
): Promise<{ lat: number; lng: number; accuracy?: number }> {
  if (typeof window === 'undefined' || !navigator.geolocation) {
    throw new GeolocationError('Geolocation is not supported by your browser.');
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        let msg = 'Failed to get your location.';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            msg = 'Location permission was denied. Please allow location access in your browser settings.';
            break;
          case error.POSITION_UNAVAILABLE:
            msg = 'Location information is currently unavailable. Please check your GPS or internet connection.';
            break;
          case error.TIMEOUT:
            msg = 'Location request timed out. Please try again.';
            break;
        }
        reject(new GeolocationError(msg, error.code));
      },
      options
    );
  });
}

/**
 * Continuously watches device GPS position for real-time driving navigation.
 * Returns an unsubscribe callback.
 */
export function watchCurrentPosition(
  onUpdate: (pos: LiveDrivingPosition) => void,
  onError?: (err: GeolocationError) => void,
  options: PositionOptions = {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 1000,
  }
): () => void {
  if (typeof window === 'undefined' || !navigator.geolocation) {
    onError?.(new GeolocationError('Geolocation is not supported by your browser.'));
    return () => {};
  }

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      onUpdate({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        heading: position.coords.heading ?? null,
        speed: position.coords.speed ?? null,
        altitude: position.coords.altitude ?? null,
        timestamp: position.timestamp,
      });
    },
    (error) => {
      let msg = 'Location tracking error.';
      switch (error.code) {
        case error.PERMISSION_DENIED:
          msg = 'Location permission denied.';
          break;
        case error.POSITION_UNAVAILABLE:
          msg = 'GPS signal lost or unavailable.';
          break;
        case error.TIMEOUT:
          msg = 'GPS signal timeout.';
          break;
      }
      onError?.(new GeolocationError(msg, error.code));
    },
    options
  );

  return () => {
    navigator.geolocation.clearWatch(watchId);
  };
}

/**
 * Calculates the great-circle distance between two coordinates in kilometers using Haversine formula.
 */
export function calculateHaversineDistanceKm(
  pos1: { lat: number; lng: number },
  pos2: { lat: number; lng: number }
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((pos2.lat - pos1.lat) * Math.PI) / 180;
  const dLon = ((pos2.lng - pos1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((pos1.lat * Math.PI) / 180) *
      Math.cos((pos2.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Reverse geocodes coordinates into an address and place name via our server API.
 */
export async function reverseGeocodeCoordinates(
  lat: number,
  lng: number,
  provider?: string
): Promise<{ name: string; address: string; location: { lat: number; lng: number }; placeId?: string }> {
  const url = new URL('/api/geocode/reverse', window.location.origin);
  url.searchParams.set('lat', lat.toString());
  url.searchParams.set('lng', lng.toString());
  if (provider) {
    url.searchParams.set('provider', provider);
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    return {
      name: 'Current Location',
      address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      location: { lat, lng },
    };
  }

  return await res.json();
}

/**
 * Requests current location and converts it into a ready-to-use Waypoint.
 */
export async function getCurrentLocationWaypoint(
  provider?: string,
  prefix = 'Current Location'
): Promise<Waypoint> {
  const coords = await getCurrentCoordinates();
  const geocoded = await reverseGeocodeCoordinates(coords.lat, coords.lng, provider);

  const displayName = geocoded.name
    ? geocoded.name === 'Current Location'
      ? `${prefix} (${geocoded.address.split(',')[0]})`
      : `${prefix}: ${geocoded.name}`
    : prefix;

  return {
    id: crypto.randomUUID(),
    name: displayName,
    address: geocoded.address || `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`,
    location: {
      lat: coords.lat,
      lng: coords.lng,
    },
    placeId: geocoded.placeId,
  };
}

/**
 * Builds universal deep link URLs to launch navigation in external apps.
 */
export function getNavigationAppUrl(
  app: 'google' | 'apple' | 'waze',
  destination: { lat: number; lng: number; name?: string },
  origin?: { lat: number; lng: number },
  waypoints?: Array<{ lat: number; lng: number }>
): string {
  const destStr = `${destination.lat},${destination.lng}`;

  if (app === 'waze') {
    return `https://waze.com/ul?ll=${destStr}&navigate=yes`;
  }

  if (app === 'apple') {
    const originParam = origin ? `&saddr=${origin.lat},${origin.lng}` : '';
    return `https://maps.apple.com/?daddr=${destStr}${originParam}&dirflg=d`;
  }

  // Google Maps default
  const originParam = origin ? `&origin=${origin.lat},${origin.lng}` : '';
  const waypointsParam =
    waypoints && waypoints.length > 0
      ? `&waypoints=${waypoints.map((w) => `${w.lat},${w.lng}`).join('|')}`
      : '';
  return `https://www.google.com/maps/dir/?api=1${originParam}&destination=${destStr}${waypointsParam}&travelmode=driving`;
}
