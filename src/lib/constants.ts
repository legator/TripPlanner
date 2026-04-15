import { TripSettings } from './types';

export const DEFAULT_SETTINGS: TripSettings = {
  maxDrivingMinutesPerDay: 420, // 8 hours
  maxDistancePerDayKm: 800,    // ~600 km per day
  fuelRangeKm: 650,            // average car range on full tank
  departureDate: new Date().toISOString().split('T')[0],
  avoidTolls: false,
  avoidHighways: false,
  checkoutTime: '10:00',
  checkinTime: '15:00',
  sightseeingMinutesPerStop: 120, // 2 hours per major stop
  restDayEvery: 3,                // rest day every 3 driving days
  oneWayTrip: false,
  fuelPricePerLiter: 1.80,
  fuelEfficiencyLPer100km: 8.0,
  useTrafficData: true,
};

export const FUEL_BUFFER_FACTOR = 0.7; // refuel at 70% of tank range

export const SEARCH_RADIUS = {
  HOTEL: 15000,        // 15 km
  GAS_STATION: 10000,  // 10 km
  ATTRACTION: 25000,   // 25 km
  RESTAURANT: 10000,   // 10 km
  EV_CHARGING: 10000,  // 10 km
  CAMPGROUND: 20000,   // 20 km
};

export const MAP_DEFAULT_CENTER = { lat: 48.5, lng: 15.0 }; // center of Europe
export const MAP_DEFAULT_ZOOM = 4;

export const DAY_COLORS = [
  '#2563eb', // blue
  '#dc2626', // red
  '#16a34a', // green
  '#9333ea', // purple
  '#ea580c', // orange
  '#0891b2', // cyan
  '#be185d', // pink
  '#854d0e', // amber
  '#4f46e5', // indigo
  '#059669', // emerald
];

export const MARKER_ICONS = {
  origin: '🏠',
  destination: '📍',
  hotel: '🏨',
  gas_station: '⛽',
  attraction: '⭐',
  restaurant: '🍽️',
  ev_charging: '⚡',
  campground: '🏕️',
};
