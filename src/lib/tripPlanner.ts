import { Place, PlaceType, DayPlan, DaySegment, TripPlan, Waypoint, TripSettings, ScheduleEvent } from './types';
import { FUEL_BUFFER_FACTOR, SEARCH_RADIUS } from './constants';
import { addDays, format } from 'date-fns';

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!;

// ─── Time helpers ───────────────────────────────────────────────────────────

/** Add `minutes` to an "HH:mm" string and return a new "HH:mm" string */
function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// ─── Google Maps REST API Helpers ───────────────────────────────────────────

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
    start_location: { lat: number; lng: number };
    end_location: { lat: number; lng: number };
    polyline: { points: string };
  }>;
}

interface DirectionsRoute {
  legs: DirectionsLeg[];
  waypoint_order: number[];
  overview_polyline: { points: string };
}

async function getDirections(
  origin: Waypoint,
  destination: Waypoint,
  intermediateWaypoints: Waypoint[],
  settings: TripSettings
): Promise<DirectionsRoute> {
  const url = new URL('https://maps.googleapis.com/maps/api/directions/json');

  // Helper: prefer place_id for accurate routing (avoids ZERO_RESULTS for
  // coordinates that land on non‑routable locations like mountain peaks)
  const toDirectionsParam = (wp: Waypoint) =>
    wp.placeId ? `place_id:${wp.placeId}` : `${wp.location.lat},${wp.location.lng}`;

  url.searchParams.set('origin', toDirectionsParam(origin));
  url.searchParams.set('destination', toDirectionsParam(destination));
  url.searchParams.set('key', GOOGLE_MAPS_API_KEY);
  url.searchParams.set('units', 'metric');

  if (intermediateWaypoints.length > 0) {
    const wpParam = intermediateWaypoints
      .map((w) => toDirectionsParam(w))
      .join('|');
    url.searchParams.set('waypoints', `optimize:true|${wpParam}`);
  }

  const avoid: string[] = [];
  if (settings.avoidTolls) avoid.push('tolls');
  if (settings.avoidHighways) avoid.push('highways');
  if (avoid.length > 0) url.searchParams.set('avoid', avoid.join('|'));

  const response = await fetch(url.toString());
  const data = await response.json();

  console.log('[Directions API] Request URL:', url.toString().replace(GOOGLE_MAPS_API_KEY, 'KEY_HIDDEN'));
  console.log('[Directions API] Status:', data.status, data.error_message || '');
  console.log('[Directions API] Routes found:', data.routes?.length || 0);
  if (data.geocoded_waypoints) {
    console.log('[Directions API] Geocoded waypoints:', JSON.stringify(data.geocoded_waypoints));
  }

  if (data.status !== 'OK') {
    if (data.status === 'ZERO_RESULTS') {
      throw new Error(
        'No driving route found between the selected places. Make sure all locations are reachable by car (not separated by ocean, on different continents without road connections, etc.).'
      );
    }
    if (data.status === 'NOT_FOUND') {
      throw new Error(
        'One or more locations could not be found. Please check your waypoints and try again.'
      );
    }
    if (data.status === 'MAX_WAYPOINTS_EXCEEDED') {
      throw new Error(
        'Too many waypoints. Google Directions API supports up to 25 waypoints. Please reduce the number of stops.'
      );
    }
    throw new Error(`Directions API error: ${data.status} - ${data.error_message || 'Please check your API key and enabled APIs.'}`);
  }

  return data.routes[0];
}

async function searchNearbyPlaces(
  location: { lat: number; lng: number },
  type: string,
  radius: number,
  maxResults: number = 5
): Promise<Place[]> {
  // Use the new Places API (v1) - required for new customers
  const url = 'https://places.googleapis.com/v1/places:searchNearby';

  const requestBody: any = {
    includedTypes: [type],
    maxResultCount: Math.min(maxResults, 20),
    locationRestriction: {
      circle: {
        center: {
          latitude: location.lat,
          longitude: location.lng,
        },
        radius: radius,
      },
    },
    rankPreference: 'POPULARITY',
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.priceLevel,places.shortFormattedAddress,places.currentOpeningHours,places.photos',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (data.error) {
      console.error(`Places API (New) error for type ${type}:`, data.error.message);
      return [];
    }

    const results = data.places || [];

    return results.map((place: any) => ({
      id: place.id || '',
      name: place.displayName?.text || 'Unknown',
      address: place.formattedAddress || '',
      location: {
        lat: place.location?.latitude || 0,
        lng: place.location?.longitude || 0,
      },
      type: mapGoogleType(type),
      rating: place.rating,
      priceLevel: mapPriceLevel(place.priceLevel),
      vicinity: place.shortFormattedAddress || place.formattedAddress || '',
      isOpen: place.currentOpeningHours?.openNow,
      photoUrl: place.photos?.[0]?.name
        ? `https://places.googleapis.com/v1/${place.photos[0].name}/media?maxWidthPx=200&key=${GOOGLE_MAPS_API_KEY}`
        : undefined,
    }));
  } catch (error) {
    console.error(`Error searching for ${type}:`, error);
    return [];
  }
}

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

function mapGoogleType(type: string): PlaceType {
  switch (type) {
    case 'lodging': return PlaceType.HOTEL;
    case 'gas_station': return PlaceType.GAS_STATION;
    case 'tourist_attraction': return PlaceType.ATTRACTION;
    case 'restaurant': return PlaceType.RESTAURANT;
    default: return PlaceType.ATTRACTION;
  }
}

// ─── Route Sampling ─────────────────────────────────────────────────────────

function samplePointsAlongLegs(
  legs: DirectionsLeg[],
  intervalKm: number
): { lat: number; lng: number }[] {
  const points: { lat: number; lng: number }[] = [];
  let accumulatedDistance = 0;
  let nextSampleAt = intervalKm * 1000; // Convert to meters

  for (const leg of legs) {
    for (const step of leg.steps) {
      accumulatedDistance += step.distance.value;

      if (accumulatedDistance >= nextSampleAt) {
        points.push(step.end_location);
        nextSampleAt += intervalKm * 1000;
      }
    }
  }

  return points;
}

function getMidpointOfLegs(legs: DirectionsLeg[]): { lat: number; lng: number } {
  let totalDistance = 0;
  for (const leg of legs) totalDistance += leg.distance.value;

  let halfDistance = totalDistance / 2;
  let accumulated = 0;

  for (const leg of legs) {
    for (const step of leg.steps) {
      accumulated += step.distance.value;
      if (accumulated >= halfDistance) {
        return step.end_location;
      }
    }
  }

  // Fallback: return start of first leg
  return legs[0].start_location;
}

// ─── Main Trip Planner ──────────────────────────────────────────────────────

export async function planTrip(
  waypoints: Waypoint[],
  settings: TripSettings
): Promise<TripPlan> {
  if (waypoints.length < 2) {
    throw new Error('Add at least 2 places — a starting point and at least one destination.');
  }

  // First waypoint is always both origin and destination (round trip).
  // All remaining waypoints are intermediate stops whose order is
  // optimised by the Directions API (`optimize:true`) to minimise
  // total driving distance.
  const origin = waypoints[0];
  const destination = waypoints[0]; // always return home
  const intermediates = waypoints.slice(1);

  // 1. Get optimized route from Google Directions
  const route = await getDirections(
    origin,
    destination,
    intermediates,
    settings
  );

  const { legs, waypoint_order, overview_polyline } = route;

  // 2. Group legs into daily segments
  const dailyGroups = groupLegsIntoDays(legs, settings);

  // 3. For each day, find nearby places and build a schedule.
  //    Also insert rest days according to settings.
  const rawDayPlans: DayPlan[] = await Promise.all(
    dailyGroups.map(async (group, index) => {
      const dayLegs = group.legs;
      const startLeg = dayLegs[0];
      const endLeg = dayLegs[dayLegs.length - 1];

      const dayDistanceKm = Math.round(group.distanceMeters / 1000);
      const dayDurationMin = Math.round(group.durationSeconds / 60);

      // Parallel fetch of all place types
      const isLastDay = index === dailyGroups.length - 1;

      const [gasStops, hotelSuggestions, attractions, restaurants] =
        await Promise.all([
          findGasStationsAlongDay(dayLegs, settings.fuelRangeKm),
          isLastDay
            ? Promise.resolve([])
            : searchNearbyPlaces(
                endLeg.end_location,
                'lodging',
                SEARCH_RADIUS.HOTEL,
                5
              ),
          findAttractions(dayLegs),
          findRestaurants(dayLegs),
        ]);

      const polylineSegments = dayLegs
        .flatMap((leg) => leg.steps.map((s) => s.polyline.points));

      // Build moveable segments (one per leg) for post-generation editing
      const segments: DaySegment[] = dayLegs.map((leg) => ({
        distanceKm: Math.round(leg.distance.value / 1000),
        durationMinutes: Math.round(leg.duration.value / 60),
        startName: leg.start_address,
        startLocation: leg.start_location,
        endName: leg.end_address,
        endLocation: leg.end_location,
        polylineSegments: leg.steps.map((s) => s.polyline.points),
      }));

      const mainStops = dayLegs.slice(0, -1).map((leg) => ({
        name: leg.end_address,
        location: leg.end_location,
      }));

      // ── Build day schedule ──
      const schedule: ScheduleEvent[] = [];
      let cursor = settings.checkoutTime; // start from checkout

      // 1) Checkout
      schedule.push({
        type: 'checkout',
        time: cursor,
        title: 'Check out & pack the car',
        durationMinutes: 0,
        icon: '🧳',
      });

      // 2) Drive segments with sightseeing at each main stop
      const numSegments = dayLegs.length;
      for (let i = 0; i < numSegments; i++) {
        const leg = dayLegs[i];
        const segDurationMin = Math.round(leg.duration.value / 60);
        const segDistanceKm = Math.round(leg.distance.value / 1000);
        const startTime = cursor;
        cursor = addMinutesToTime(cursor, segDurationMin);

        schedule.push({
          type: 'drive',
          time: startTime,
          endTime: cursor,
          title: `Drive to ${leg.end_address.split(',')[0]} (${segDistanceKm} km)`,
          durationMinutes: segDurationMin,
          icon: '🚗',
        });

        // Add gas stop if one falls roughly in this segment
        if (gasStops.length > 0 && i === Math.floor(numSegments / 2)) {
          schedule.push({
            type: 'fuel',
            time: cursor,
            endTime: addMinutesToTime(cursor, 15),
            title: 'Refuel & stretch',
            durationMinutes: 15,
            icon: '⛽',
          });
          cursor = addMinutesToTime(cursor, 15);
        }

        // Sightseeing at intermediate stops
        if (i < numSegments - 1 && settings.sightseeingMinutesPerStop > 0) {
          const seeTime = settings.sightseeingMinutesPerStop;
          schedule.push({
            type: 'sightseeing',
            time: cursor,
            endTime: addMinutesToTime(cursor, seeTime),
            title: `Explore ${leg.end_address.split(',')[0]}`,
            durationMinutes: seeTime,
            icon: '🚶',
          });
          cursor = addMinutesToTime(cursor, seeTime);
        }

        // Lunch break near midpoint of driving
        if (i === Math.floor(numSegments / 2) && numSegments > 1 || (numSegments === 1 && segDurationMin > 120)) {
          schedule.push({
            type: 'lunch',
            time: cursor,
            endTime: addMinutesToTime(cursor, 60),
            title: 'Lunch break',
            durationMinutes: 60,
            icon: '🍽️',
          });
          cursor = addMinutesToTime(cursor, 60);
        }
      }

      // 3) Arrival – check-in or arrive home
      if (isLastDay) {
        schedule.push({
          type: 'arrive_home',
          time: cursor,
          title: 'Arrive home 🎉',
          durationMinutes: 0,
          icon: '🏠',
        });
      } else {
        // If we arrive before check-in time, add free time
        const [curH, curM] = cursor.split(':').map(Number);
        const [ciH, ciM] = settings.checkinTime.split(':').map(Number);
        const curTotal = curH * 60 + curM;
        const ciTotal = ciH * 60 + ciM;

        if (curTotal < ciTotal) {
          const freeMin = ciTotal - curTotal;
          schedule.push({
            type: 'sightseeing',
            time: cursor,
            endTime: settings.checkinTime,
            title: `Explore ${endLeg.end_address.split(',')[0]}`,
            durationMinutes: freeMin,
            icon: '🚶',
          });
          cursor = settings.checkinTime;
        }

        schedule.push({
          type: 'checkin',
          time: cursor,
          title: 'Check in & relax',
          durationMinutes: 0,
          icon: '🏨',
        });
      }

      return {
        dayNumber: 0, // will be assigned after rest-day insertion
        date: '',
        isRestDay: false,
        startLocation: {
          name: startLeg.start_address,
          location: startLeg.start_location,
        },
        endLocation: {
          name: endLeg.end_address,
          location: endLeg.end_location,
        },
        mainStops,
        distanceKm: dayDistanceKm,
        durationMinutes: dayDurationMin,
        gasStops,
        hotelSuggestions,
        attractions,
        restaurants,
        polylineSegments,
        schedule,
        segments,
      };
    })
  );

  // 4. Insert rest days
  const dayPlans: DayPlan[] = [];
  let calendarDay = 0;
  let drivingDaysSinceRest = 0;

  for (let i = 0; i < rawDayPlans.length; i++) {
    // Check if a rest day is due (but not before the very first day or after the last)
    if (
      settings.restDayEvery > 0 &&
      drivingDaysSinceRest >= settings.restDayEvery &&
      i < rawDayPlans.length
    ) {
      const prevDay = rawDayPlans[i - 1] || rawDayPlans[i];
      const restDate = format(
        addDays(new Date(settings.departureDate), calendarDay),
        'yyyy-MM-dd'
      );
      dayPlans.push({
        dayNumber: dayPlans.length + 1,
        date: restDate,
        isRestDay: true,
        startLocation: prevDay.endLocation,
        endLocation: prevDay.endLocation,
        mainStops: [],
        distanceKm: 0,
        durationMinutes: 0,
        gasStops: [],
        hotelSuggestions: prevDay.hotelSuggestions,
        attractions: prevDay.attractions,
        restaurants: prevDay.restaurants,
        polylineSegments: [],
        schedule: [
          { type: 'rest_day', time: '09:00', title: 'Sleep in & relax', durationMinutes: 0, icon: '😴' },
          { type: 'sightseeing', time: '10:00', endTime: '13:00', title: `Explore ${prevDay.endLocation.name.split(',')[0]}`, durationMinutes: 180, icon: '🚶' },
          { type: 'lunch', time: '13:00', endTime: '14:00', title: 'Lunch', durationMinutes: 60, icon: '🍽️' },
          { type: 'free_time', time: '14:00', endTime: '19:00', title: 'Free time — relax, explore, recharge', durationMinutes: 300, icon: '🌿' },
        ],
        segments: [],
      });
      calendarDay++;
      drivingDaysSinceRest = 0;
    }

    // Assign real day number and date
    const dp = { ...rawDayPlans[i] };
    dp.dayNumber = dayPlans.length + 1;
    dp.date = format(
      addDays(new Date(settings.departureDate), calendarDay),
      'yyyy-MM-dd'
    );
    dayPlans.push(dp);
    calendarDay++;
    drivingDaysSinceRest++;
  }

  // Calculate totals
  const totalDistanceKm = dayPlans.reduce((sum, d) => sum + d.distanceKm, 0);
  const totalDurationMinutes = dayPlans.reduce(
    (sum, d) => sum + d.durationMinutes,
    0
  );

  return {
    days: dayPlans,
    totalDistanceKm,
    totalDurationMinutes,
    totalDays: dayPlans.length,
    waypointOrder: waypoint_order || [],
    overviewPolyline: overview_polyline.points,
    departureDate: settings.departureDate,
  };
}

// ─── Day Grouping ───────────────────────────────────────────────────────────

interface DayGroup {
  legs: DirectionsLeg[];
  distanceMeters: number;
  durationSeconds: number;
}

/**
 * Split a single Directions leg into multiple "virtual" legs by
 * grouping its steps so that each virtual leg stays within the
 * daily distance / duration limits.
 */
function splitLegBySteps(
  leg: DirectionsLeg,
  maxDistanceMeters: number,
  maxDurationSeconds: number
): DirectionsLeg[] {
  const result: DirectionsLeg[] = [];
  let steps: DirectionsLeg['steps'] = [];
  let dist = 0;
  let dur = 0;

  const flush = () => {
    if (steps.length === 0) return;
    const first = steps[0];
    const last = steps[steps.length - 1];
    result.push({
      distance: { value: dist, text: `${Math.round(dist / 1000)} km` },
      duration: { value: dur, text: `${Math.round(dur / 60)} mins` },
      start_address: result.length === 0 ? leg.start_address : `Overnight stop`,
      end_address: `Overnight stop`,
      start_location: first.start_location,
      end_location: last.end_location,
      steps: [...steps],
    });
    steps = [];
    dist = 0;
    dur = 0;
  };

  for (const step of leg.steps) {
    const nextDist = dist + step.distance.value;
    const nextDur = dur + step.duration.value;

    if (steps.length > 0 && (nextDist > maxDistanceMeters || nextDur > maxDurationSeconds)) {
      flush();
    }

    steps.push(step);
    dist += step.distance.value;
    dur += step.duration.value;
  }

  // Flush remaining steps
  if (steps.length > 0) {
    const first = steps[0];
    const last = steps[steps.length - 1];
    result.push({
      distance: { value: dist, text: `${Math.round(dist / 1000)} km` },
      duration: { value: dur, text: `${Math.round(dur / 60)} mins` },
      start_address: result.length === 0 ? leg.start_address : `Overnight stop`,
      end_address: leg.end_address,
      start_location: first.start_location,
      end_location: last.end_location,
      steps: [...steps],
    });
  }

  return result;
}

function groupLegsIntoDays(
  legs: DirectionsLeg[],
  settings: TripSettings
): DayGroup[] {
  const maxDistanceMeters = settings.maxDistancePerDayKm * 1000;
  const maxDurationSeconds = settings.maxDrivingMinutesPerDay * 60;

  // First, expand legs that are individually longer than the daily limit
  const expandedLegs: DirectionsLeg[] = [];
  for (const leg of legs) {
    if (leg.distance.value > maxDistanceMeters || leg.duration.value > maxDurationSeconds) {
      expandedLegs.push(...splitLegBySteps(leg, maxDistanceMeters, maxDurationSeconds));
    } else {
      expandedLegs.push(leg);
    }
  }

  // Now group the (possibly split) legs into days
  const groups: DayGroup[] = [];
  let current: DayGroup = { legs: [], distanceMeters: 0, durationSeconds: 0 };

  for (const leg of expandedLegs) {
    const newDistance = current.distanceMeters + leg.distance.value;
    const newDuration = current.durationSeconds + leg.duration.value;

    // If adding this leg would exceed daily limits and we already have legs,
    // start a new day
    if (
      current.legs.length > 0 &&
      (newDistance > maxDistanceMeters || newDuration > maxDurationSeconds)
    ) {
      groups.push(current);
      current = {
        legs: [leg],
        distanceMeters: leg.distance.value,
        durationSeconds: leg.duration.value,
      };
    } else {
      current.legs.push(leg);
      current.distanceMeters = newDistance;
      current.durationSeconds = newDuration;
    }
  }

  // Push the last day
  if (current.legs.length > 0) {
    groups.push(current);
  }

  return groups;
}

// ─── Place Finders ──────────────────────────────────────────────────────────

async function findGasStationsAlongDay(
  legs: DirectionsLeg[],
  fuelRangeKm: number
): Promise<Place[]> {
  const refuelIntervalKm = fuelRangeKm * FUEL_BUFFER_FACTOR;
  const totalDistanceKm =
    legs.reduce((sum, l) => sum + l.distance.value, 0) / 1000;

  // Only search for gas if the day's distance is significant
  if (totalDistanceKm < refuelIntervalKm * 0.5) return [];

  const samplePoints = samplePointsAlongLegs(legs, refuelIntervalKm);

  if (samplePoints.length === 0 && totalDistanceKm > refuelIntervalKm * 0.8) {
    // Search at midpoint
    const midpoint = getMidpointOfLegs(legs);
    samplePoints.push(midpoint);
  }

  const allStations: Place[] = [];
  const seenIds = new Set<string>();

  for (const point of samplePoints.slice(0, 3)) {
    // Limit API calls
    const stations = await searchNearbyPlaces(
      point,
      'gas_station',
      SEARCH_RADIUS.GAS_STATION,
      2
    );
    for (const station of stations) {
      if (!seenIds.has(station.id)) {
        seenIds.add(station.id);
        allStations.push(station);
      }
    }
  }

  return allStations;
}

async function findAttractions(legs: DirectionsLeg[]): Promise<Place[]> {
  // Search at midpoint and near the interesting stops
  const midpoint = getMidpointOfLegs(legs);
  const attractions = await searchNearbyPlaces(
    midpoint,
    'tourist_attraction',
    SEARCH_RADIUS.ATTRACTION,
    5
  );

  // Also search near end point if it's different enough
  if (legs.length > 1) {
    const endPoint = legs[legs.length - 1].end_location;
    const endAttractions = await searchNearbyPlaces(
      endPoint,
      'tourist_attraction',
      SEARCH_RADIUS.ATTRACTION,
      3
    );

    const seenIds = new Set(attractions.map((a) => a.id));
    for (const attr of endAttractions) {
      if (!seenIds.has(attr.id)) {
        attractions.push(attr);
      }
    }
  }

  return attractions.slice(0, 6);
}

async function findRestaurants(legs: DirectionsLeg[]): Promise<Place[]> {
  const midpoint = getMidpointOfLegs(legs);
  const restaurants = await searchNearbyPlaces(
    midpoint,
    'restaurant',
    SEARCH_RADIUS.RESTAURANT,
    4
  );

  return restaurants;
}
