import { Place, PlaceType, DayPlan, DaySegment, TripPlan, Waypoint, TripSettings, ScheduleEvent } from './types';
import { FUEL_BUFFER_FACTOR, SEARCH_RADIUS } from './constants';
import { addDays, format } from 'date-fns';
import { getRoutingProvider, RouteLeg, RouteStep, NearbyPlace, MapProviderName } from './providers';

// ─── Time helpers ───────────────────────────────────────────────────────────

/** Add `minutes` to an "HH:mm" string and return a new "HH:mm" string */
function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// ─── Place type mapping ──────────────────────────────────────────────────────

function mapProviderType(type: string): PlaceType {
  switch (type) {
    case 'lodging': return PlaceType.HOTEL;
    case 'gas_station': return PlaceType.GAS_STATION;
    case 'tourist_attraction': return PlaceType.ATTRACTION;
    case 'restaurant': return PlaceType.RESTAURANT;
    case 'electric_vehicle_charging_station': return PlaceType.EV_CHARGING;
    case 'campground': return PlaceType.CAMPGROUND;
    default: return PlaceType.ATTRACTION;
  }
}

function toPlace(p: NearbyPlace): Place {
  return {
    id: p.id,
    name: p.name,
    address: p.address,
    location: p.location,
    type: mapProviderType(p.type),
    rating: p.rating,
    priceLevel: p.priceLevel,
    vicinity: p.address,
    isOpen: p.isOpen,
    photoUrl: p.photoUrl,
  };
}

async function findNearby(
  location: { lat: number; lng: number },
  type: string,
  radius: number,
  maxResults = 5
  , preferred?: MapProviderName
): Promise<Place[]> {
  const provider = getRoutingProvider(preferred);
  const results = await provider.searchNearby(location, type, radius, maxResults);
  return results.map(toPlace);
}

// ─── Route Sampling ─────────────────────────────────────────────────────────

function samplePointsAlongLegs(
  legs: RouteLeg[],
  intervalKm: number
): { lat: number; lng: number }[] {
  const points: { lat: number; lng: number }[] = [];
  let accumulated = 0;
  let nextSampleAt = intervalKm * 1000;

  for (const leg of legs) {
    for (const step of leg.steps) {
      accumulated += step.distanceMeters;
      if (accumulated >= nextSampleAt) {
        points.push(step.endLocation);
        nextSampleAt += intervalKm * 1000;
      }
    }
  }

  return points;
}

function getMidpointOfLegs(legs: RouteLeg[]): { lat: number; lng: number } {
  let totalDistance = 0;
  for (const leg of legs) totalDistance += leg.distanceMeters;

  const halfDistance = totalDistance / 2;
  let accumulated = 0;

  for (const leg of legs) {
    for (const step of leg.steps) {
      accumulated += step.distanceMeters;
      if (accumulated >= halfDistance) return step.endLocation;
    }
  }

  return legs[0].startLocation;
}

// ─── Main Trip Planner ──────────────────────────────────────────────────────

export async function planTrip(
  waypoints: Waypoint[],
  settings: TripSettings,
  preferredProvider?: MapProviderName
): Promise<TripPlan> {
  if (waypoints.length < 2) {
    throw new Error('Add at least 2 places — a starting point and at least one destination.');
  }

  // First waypoint is always both origin and destination (round trip).
  // All remaining waypoints are intermediate stops whose order is
  // optimised by the Directions API (`optimize:true`) to minimise
  // total driving distance.
  const origin = waypoints[0];
  const destination = settings.oneWayTrip
    ? waypoints[waypoints.length - 1]
    : waypoints[0]; // return home
  const intermediates = settings.oneWayTrip
    ? waypoints.slice(1, -1)
    : waypoints.slice(1);

  const provider = getRoutingProvider(preferredProvider);
  const route = await provider.getRoute(origin, destination, intermediates, settings);
  const { legs, waypointOrder, overviewPolyline } = route;

  const dailyGroups = groupLegsIntoDays(legs, settings);
  const rawDayPlans: DayPlan[] = await Promise.all(
    dailyGroups.map(async (group, index) => {
      const dayLegs = group.legs;
      const startLeg = dayLegs[0];
      const endLeg = dayLegs[dayLegs.length - 1];

      const dayDistanceKm = Math.round(group.distanceMeters / 1000);
      const dayDurationMin = Math.round(group.durationSeconds / 60);

      // Parallel fetch of all place types
      const isLastDay = index === dailyGroups.length - 1;

      const [gasStops, hotelSuggestions, attractions, restaurants, evChargingStops, campgrounds] =
        await Promise.all([
          findGasStationsAlongDay(dayLegs, settings.fuelRangeKm, preferredProvider),
          isLastDay ? Promise.resolve([]) : findNearby(endLeg.endLocation, 'lodging', SEARCH_RADIUS.HOTEL, 5, preferredProvider),
          findAttractions(dayLegs, preferredProvider),
          findRestaurants(dayLegs, preferredProvider),
          findEvChargingAlongDay(dayLegs, settings.fuelRangeKm, preferredProvider),
          isLastDay ? Promise.resolve([]) : findNearby(endLeg.endLocation, 'campground', SEARCH_RADIUS.CAMPGROUND, 3, preferredProvider),
        ]);

      const estimatedFuelCost =
        Math.round(
          (dayDistanceKm / 100) *
            (settings.fuelEfficiencyLPer100km ?? 8.0) *
            (settings.fuelPricePerLiter ?? 1.8) *
            10
        ) / 10;

      const polylineSegments = dayLegs.flatMap((leg) => leg.steps.map((s: RouteStep) => s.encodedPolyline));

      const segments: DaySegment[] = dayLegs.map((leg) => ({
        distanceKm: Math.round(leg.distanceMeters / 1000),
        durationMinutes: Math.round(leg.durationSeconds / 60),
        startName: leg.startAddress,
        startLocation: leg.startLocation,
        endName: leg.endAddress,
        endLocation: leg.endLocation,
        polylineSegments: leg.steps.map((s: RouteStep) => s.encodedPolyline),
      }));

      const mainStops = dayLegs.slice(0, -1).map((leg) => ({
        name: leg.endAddress,
        location: leg.endLocation,
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
        const segDurationMin = Math.round(leg.durationSeconds / 60);
        const segDistanceKm = Math.round(leg.distanceMeters / 1000);
        const startTime = cursor;
        cursor = addMinutesToTime(cursor, segDurationMin);

        schedule.push({
          type: 'drive',
          time: startTime,
          endTime: cursor,
          title: `Drive to ${leg.endAddress.split(',')[0]} (${segDistanceKm} km)`,
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
            title: `Explore ${leg.endAddress.split(',')[0]}`,
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
          title: settings.oneWayTrip ? 'Arrived at destination 🎉' : 'Arrive home 🎉',
          durationMinutes: 0,
          icon: settings.oneWayTrip ? '📍' : '🏠',
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
            title: `Explore ${endLeg.endAddress.split(',')[0]}`,
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
          name: startLeg.startAddress,
          location: startLeg.startLocation,
        },
        endLocation: {
          name: endLeg.endAddress,
          location: endLeg.endLocation,
        },
        mainStops,
        distanceKm: dayDistanceKm,
        durationMinutes: dayDurationMin,
        gasStops,
        hotelSuggestions,
        attractions,
        restaurants,
        evChargingStops,
        campgrounds,
        estimatedFuelCost,
        polylineSegments,
        schedule,
        segments,
      };
    })
  );

  // Insert rest days
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
        evChargingStops: [],
        campgrounds: prevDay.campgrounds,
        estimatedFuelCost: 0,
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

  const totalDistanceKm = dayPlans.reduce((sum, d) => sum + d.distanceKm, 0);
  const totalDurationMinutes = dayPlans.reduce(
    (sum, d) => sum + d.durationMinutes,
    0
  );
  const estimatedTotalFuelCost =
    Math.round(
      dayPlans.reduce((sum, d) => sum + (d.estimatedFuelCost ?? 0), 0) * 10
    ) / 10;

  return {
    days: dayPlans,
    totalDistanceKm,
    totalDurationMinutes,
    totalDays: dayPlans.length,
    waypointOrder,
    overviewPolyline,
    departureDate: settings.departureDate,
    estimatedTotalFuelCost,
  };
}

// ─── Day Grouping ───────────────────────────────────────────────────────────

interface DayGroup {
  legs: RouteLeg[];
  distanceMeters: number;
  durationSeconds: number;
}

function splitLegBySteps(
  leg: RouteLeg,
  maxDistanceMeters: number,
  maxDurationSeconds: number
): RouteLeg[] {
  const result: RouteLeg[] = [];
  let steps: RouteStep[] = [];
  let dist = 0;
  let dur = 0;

  const flush = () => {
    if (steps.length === 0) return;
    const first = steps[0];
    const last = steps[steps.length - 1];
    result.push({
      distanceMeters: dist,
      durationSeconds: dur,
      startAddress: result.length === 0 ? leg.startAddress : 'Overnight stop',
      endAddress: 'Overnight stop',
      startLocation: first.startLocation,
      endLocation: last.endLocation,
      steps: [...steps],
    });
    steps = [];
    dist = 0;
    dur = 0;
  };

  for (const step of leg.steps) {
    if (steps.length > 0 && (dist + step.distanceMeters > maxDistanceMeters || dur + step.durationSeconds > maxDurationSeconds)) {
      flush();
    }
    steps.push(step);
    dist += step.distanceMeters;
    dur += step.durationSeconds;
  }

  if (steps.length > 0) {
    const first = steps[0];
    const last = steps[steps.length - 1];
    result.push({
      distanceMeters: dist,
      durationSeconds: dur,
      startAddress: result.length === 0 ? leg.startAddress : 'Overnight stop',
      endAddress: leg.endAddress,
      startLocation: first.startLocation,
      endLocation: last.endLocation,
      steps: [...steps],
    });
  }

  return result;
}

function groupLegsIntoDays(legs: RouteLeg[], settings: TripSettings): DayGroup[] {
  const maxDistanceMeters = settings.maxDistancePerDayKm * 1000;
  const maxDurationSeconds = settings.maxDrivingMinutesPerDay * 60;

  const expandedLegs: RouteLeg[] = [];
  for (const leg of legs) {
    if (leg.distanceMeters > maxDistanceMeters || leg.durationSeconds > maxDurationSeconds) {
      expandedLegs.push(...splitLegBySteps(leg, maxDistanceMeters, maxDurationSeconds));
    } else {
      expandedLegs.push(leg);
    }
  }

  const groups: DayGroup[] = [];
  let current: DayGroup = { legs: [], distanceMeters: 0, durationSeconds: 0 };

  for (const leg of expandedLegs) {
    const newDist = current.distanceMeters + leg.distanceMeters;
    const newDur = current.durationSeconds + leg.durationSeconds;
    if (current.legs.length > 0 && (newDist > maxDistanceMeters || newDur > maxDurationSeconds)) {
      groups.push(current);
      current = { legs: [leg], distanceMeters: leg.distanceMeters, durationSeconds: leg.durationSeconds };
    } else {
      current.legs.push(leg);
      current.distanceMeters = newDist;
      current.durationSeconds = newDur;
    }
  }

  if (current.legs.length > 0) groups.push(current);
  return groups;
}

// ─── Place Finders ──────────────────────────────────────────────────────────

async function findGasStationsAlongDay(legs: RouteLeg[], fuelRangeKm: number, preferred?: MapProviderName): Promise<Place[]> {
  const intervalKm = fuelRangeKm * FUEL_BUFFER_FACTOR;
  const totalKm = legs.reduce((s, l) => s + l.distanceMeters, 0) / 1000;
  if (totalKm < intervalKm * 0.5) return [];
  const samplePoints = samplePointsAlongLegs(legs, intervalKm);
  if (samplePoints.length === 0 && totalKm > intervalKm * 0.8) samplePoints.push(getMidpointOfLegs(legs));
  const seen = new Set<string>();
  const results: Place[] = [];
  for (const point of samplePoints.slice(0, 3)) {
    const stations = await findNearby(point, 'gas_station', SEARCH_RADIUS.GAS_STATION, 2, preferred);
    for (const s of stations) { if (!seen.has(s.id)) { seen.add(s.id); results.push(s); } }
  }
  return results;
}

async function findAttractions(legs: RouteLeg[], preferred?: MapProviderName): Promise<Place[]> {
  const midpoint = getMidpointOfLegs(legs);
  const attractions = await findNearby(midpoint, 'tourist_attraction', SEARCH_RADIUS.ATTRACTION, 5, preferred);
  if (legs.length > 1) {
    const endPoint = legs[legs.length - 1].endLocation;
    const endAttractions = await findNearby(endPoint, 'tourist_attraction', SEARCH_RADIUS.ATTRACTION, 3, preferred);
    const seen = new Set(attractions.map((a) => a.id));
    for (const attr of endAttractions) { if (!seen.has(attr.id)) attractions.push(attr); }
  }
  return attractions.slice(0, 6);
}

async function findRestaurants(legs: RouteLeg[], preferred?: MapProviderName): Promise<Place[]> {
  return findNearby(getMidpointOfLegs(legs), 'restaurant', SEARCH_RADIUS.RESTAURANT, 4, preferred);
}

async function findEvChargingAlongDay(legs: RouteLeg[], fuelRangeKm: number, preferred?: MapProviderName): Promise<Place[]> {
  const intervalKm = fuelRangeKm * FUEL_BUFFER_FACTOR;
  const totalKm = legs.reduce((s, l) => s + l.distanceMeters, 0) / 1000;
  if (totalKm < intervalKm * 0.5) return [];
  let samplePoints = samplePointsAlongLegs(legs, intervalKm);
  if (samplePoints.length === 0) samplePoints = [getMidpointOfLegs(legs)];
  const seen = new Set<string>();
  const results: Place[] = [];
  for (const point of samplePoints.slice(0, 3)) {
    const stations = await findNearby(point, 'electric_vehicle_charging_station', SEARCH_RADIUS.EV_CHARGING, 2, preferred);
    for (const s of stations) { if (!seen.has(s.id)) { seen.add(s.id); results.push(s); } }
  }
  return results;
}

