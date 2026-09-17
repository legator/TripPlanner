import { Waypoint, TripSettings } from './types';

const MAX_WAYPOINTS = 25;
const LAT_MIN = -90, LAT_MAX = 90;
const LNG_MIN = -180, LNG_MAX = 180;

const SETTINGS_CLAMPS: Record<string, [number, number]> = {
  maxDrivingMinutesPerDay: [60, 1440],
  maxDistancePerDayKm: [10, 2000],
  fuelRangeKm: [50, 5000],
  sightseeingMinutesPerStop: [0, 480],
  restDayEvery: [0, 30],
  fuelPricePerLiter: [0, 20],
  fuelEfficiencyLPer100km: [0.1, 100],
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v);
}

function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    isFiniteNumber(lat) && lat >= LAT_MIN && lat <= LAT_MAX &&
    isFiniteNumber(lng) && lng >= LNG_MIN && lng <= LNG_MAX
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function validateWaypoints(waypoints: unknown): string | null {
  if (!Array.isArray(waypoints)) return 'waypoints must be an array';
  if (waypoints.length < 2) return 'At least 2 waypoints are required';
  if (waypoints.length > MAX_WAYPOINTS) {
    return `A maximum of ${MAX_WAYPOINTS} waypoints is supported`;
  }

  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i] as Partial<Waypoint>;
    if (!isNonEmptyString(wp?.name)) {
      return `Waypoint ${i + 1} is missing a name`;
    }
    if (!isValidLatLng(wp?.location?.lat, wp?.location?.lng)) {
      return `Waypoint ${i + 1} has an invalid location`;
    }
  }
  return null;
}

export function validateAndClampSettings(raw: unknown): { settings: TripSettings; error: string | null } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { settings: raw as TripSettings, error: 'settings must be an object' };
  }

  const s = raw as Record<string, unknown>;

  if (!isNonEmptyString(s.departureDate)) {
    return { settings: raw as TripSettings, error: 'settings.departureDate is required' };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.departureDate as string)) {
    return { settings: raw as TripSettings, error: 'settings.departureDate must be in YYYY-MM-DD format' };
  }

  const validTransportModes = ['car', 'pedestrian', 'bicycle', 'scooter', 'truck', 'bus'];
  if (s.transportMode !== undefined && !validTransportModes.includes(s.transportMode as string)) {
    return { settings: raw as TripSettings, error: `settings.transportMode must be one of: ${validTransportModes.join(', ')}` };
  }

  const clamped = { ...s };
  for (const [field, [min, max]] of Object.entries(SETTINGS_CLAMPS)) {
    if (field in clamped && isFiniteNumber(clamped[field])) {
      clamped[field] = clamp(clamped[field] as number, min, max);
    }
  }

  return { settings: clamped as unknown as TripSettings, error: null };
}
