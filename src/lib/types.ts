export interface LatLng {
  lat: number;
  lng: number;
}

export interface Place {
  id: string;
  name: string;
  address: string;
  location: LatLng;
  type: PlaceType;
  rating?: number;
  priceLevel?: number;
  photoUrl?: string;
  vicinity?: string;
  isOpen?: boolean;
}

export enum PlaceType {
  ORIGIN = 'origin',
  DESTINATION = 'destination',
  HOTEL = 'hotel',
  GAS_STATION = 'gas_station',
  ATTRACTION = 'attraction',
  RESTAURANT = 'restaurant',
}

export interface Waypoint {
  id: string;
  name: string;
  address: string;
  location: LatLng;
  /** Google Maps Place ID – used by the Directions API for accurate routing */
  placeId?: string;
}

export interface TripSettings {
  maxDrivingMinutesPerDay: number;
  maxDistancePerDayKm: number;
  fuelRangeKm: number;
  departureDate: string;
  avoidTolls: boolean;
  avoidHighways: boolean;
  /** Time you must leave accommodation (HH:mm) */
  checkoutTime: string;
  /** Earliest check-in time at next accommodation (HH:mm) */
  checkinTime: string;
  /** Minutes allocated for walking / sightseeing at each major stop */
  sightseeingMinutesPerStop: number;
  /** Insert a rest day (no driving) every N driving days (0 = never) */
  restDayEvery: number;
}

export type ScheduleEventType =
  | 'checkout'
  | 'drive'
  | 'fuel'
  | 'sightseeing'
  | 'lunch'
  | 'checkin'
  | 'arrive_home'
  | 'free_time'
  | 'rest_day';

export interface ScheduleEvent {
  type: ScheduleEventType;
  time: string;       // HH:mm
  endTime?: string;   // HH:mm
  title: string;
  durationMinutes: number;
  icon: string;
}

export interface DaySegment {
  distanceKm: number;
  durationMinutes: number;
  startName: string;
  startLocation: LatLng;
  endName: string;
  endLocation: LatLng;
  polylineSegments: string[];
}

export interface DayPlan {
  dayNumber: number;
  date: string;
  isRestDay: boolean;
  startLocation: {
    name: string;
    location: LatLng;
  };
  endLocation: {
    name: string;
    location: LatLng;
  };
  mainStops: Array<{
    name: string;
    location: LatLng;
  }>;
  distanceKm: number;
  durationMinutes: number;
  gasStops: Place[];
  hotelSuggestions: Place[];
  attractions: Place[];
  restaurants: Place[];
  /** Array of encoded polyline segments (one per step) – decode individually */
  polylineSegments: string[];
  /** Timeline of the day */
  schedule: ScheduleEvent[];
  /** Moveable route segments for editing day boundaries */
  segments: DaySegment[];
}

export interface TripPlan {
  days: DayPlan[];
  totalDistanceKm: number;
  totalDurationMinutes: number;
  totalDays: number;
  waypointOrder: number[];
  overviewPolyline: string;
  departureDate: string;
}

export interface PlanTripRequest {
  waypoints: Waypoint[];
  settings: TripSettings;
}

export type ActiveView = 'input' | 'plan';
