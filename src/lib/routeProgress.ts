import { DayPlan, LatLng, TripPlan } from './types';
import { decodePolyline } from './tripGpxExport';
import { calculateHaversineDistanceKm } from './location';

export interface DayTargetStop {
  id: string;
  name: string;
  location: LatLng;
  stopIndex: number; // 0-indexed among upcoming stops
  totalStops: number;
  isDayEnd: boolean;
  dayIndex: number;
  dayNumber: number;
}

/**
 * Decodes all polyline segments of a day into a single connected sequence of points.
 */
export function decodeDayPolyline(day: DayPlan): LatLng[] {
  const fallbackPoints: LatLng[] = [
    day.startLocation.location,
    ...(day.mainStops || []).map((s) => s.location),
    day.endLocation.location,
  ];

  if (!day.polylineSegments || day.polylineSegments.length === 0) {
    return fallbackPoints;
  }

  const allPoints: LatLng[] = [];
  for (const seg of day.polylineSegments) {
    const pts = decodePolyline(seg);
    if (pts.length > 0) {
      if (allPoints.length > 0) {
        // Skip duplicate connecting point
        allPoints.push(...pts.slice(1));
      } else {
        allPoints.push(...pts);
      }
    }
  }

  return allPoints.length > 0 ? allPoints : fallbackPoints;
}

/**
 * Returns all distinct destination stops for a day in order of travel.
 * Excludes the startLocation itself because navigation targets upcoming destinations.
 */
export function getOrderedDayTargetStops(day: DayPlan, dayIndex: number): DayTargetStop[] {
  const stops: DayTargetStop[] = [];
  const dayNumber = day.dayNumber || dayIndex + 1;

  // Intermediate waypoints / main stops
  if (day.mainStops && day.mainStops.length > 0) {
    day.mainStops.forEach((stop, i) => {
      stops.push({
        id: `main-${dayIndex}-${i}`,
        name: stop.name,
        location: stop.location,
        stopIndex: i,
        totalStops: day.mainStops.length + 1,
        isDayEnd: false,
        dayIndex,
        dayNumber,
      });
    });
  }

  // Final destination of the day (overnight stop or final trip destination)
  stops.push({
    id: `end-${dayIndex}`,
    name: day.endLocation.name,
    location: day.endLocation.location,
    stopIndex: stops.length,
    totalStops: stops.length + 1,
    isDayEnd: true,
    dayIndex,
    dayNumber,
  });

  // Update totalStops on all entries
  stops.forEach((s) => {
    s.totalStops = stops.length;
  });

  return stops;
}

/**
 * Finds the index of the closest point on a polyline path and the distance in km.
 */
export function findClosestPointOnPath(
  pos: LatLng,
  path: LatLng[]
): { index: number; distanceKm: number } {
  if (path.length === 0) return { index: 0, distanceKm: 0 };

  let minDistance = Infinity;
  let bestIndex = 0;

  for (let i = 0; i < path.length; i++) {
    const dist = calculateHaversineDistanceKm(pos, path[i]);
    if (dist < minDistance) {
      minDistance = dist;
      bestIndex = i;
    }
  }

  return { index: bestIndex, distanceKm: minDistance };
}

/**
 * Calculates road distance along the route polyline between two indices.
 */
export function calculatePolylineDistanceKm(
  path: LatLng[],
  startIndex: number,
  endIndex: number
): number {
  if (startIndex >= endIndex || path.length < 2) return 0;
  const start = Math.max(0, startIndex);
  const end = Math.min(path.length - 1, endIndex);
  let dist = 0;
  for (let i = start; i < end; i++) {
    dist += calculateHaversineDistanceKm(path[i], path[i + 1]);
  }
  return Math.round(dist * 10) / 10;
}

/**
 * Determines which stop on the given day is the next upcoming target.
 * Also detects if the driver has already driven past earlier stops.
 */
export function findUpcomingStopOnDay(
  day: DayPlan,
  dayIndex: number,
  currentPos: LatLng | null
): {
  targetStop: DayTargetStop;
  targetIndex: number;
  allStops: DayTargetStop[];
  isDayPassed: boolean;
  distanceToTargetKm: number;
} {
  const allStops = getOrderedDayTargetStops(day, dayIndex);

  if (!currentPos || allStops.length === 0) {
    const firstStop = allStops[0];
    const dist = currentPos ? calculateHaversineDistanceKm(currentPos, firstStop.location) : day.distanceKm;
    return {
      targetStop: firstStop,
      targetIndex: 0,
      allStops,
      isDayPassed: false,
      distanceToTargetKm: Math.round(dist * 10) / 10,
    };
  }

  const path = decodeDayPolyline(day);

  if (path.length === 0) {
    // Fallback when route polyline is not available
    let targetIndex = 0;
    for (let i = 0; i < allStops.length; i++) {
      const stop = allStops[i];
      const dist = calculateHaversineDistanceKm(currentPos, stop.location);
      if (i === allStops.length - 1) {
        return {
          targetStop: stop,
          targetIndex: i,
          allStops,
          isDayPassed: dist < 0.3,
          distanceToTargetKm: Math.round(dist * 10) / 10,
        };
      }
      const nextDist = calculateHaversineDistanceKm(currentPos, allStops[i + 1].location);
      if (dist < 0.3 && nextDist < dist) {
        continue;
      }
      targetIndex = i;
      break;
    }
    const activeTarget = allStops[targetIndex];
    return {
      targetStop: activeTarget,
      targetIndex,
      allStops,
      isDayPassed: false,
      distanceToTargetKm: Math.round(calculateHaversineDistanceKm(currentPos, activeTarget.location) * 10) / 10,
    };
  }

  const { index: vehiclePathIndex, distanceKm: distToRoute } = findClosestPointOnPath(currentPos, path);

  // Map each stop to its index along the route path
  const stopIndices = allStops.map((stop) => {
    return findClosestPointOnPath(stop.location, path).index;
  });

  // Find the first stop that the vehicle has NOT yet driven past.
  let targetIndex = 0;

  for (let i = 0; i < allStops.length; i++) {
    const stop = allStops[i];
    const stopIdxOnPath = stopIndices[i];
    const distDirectToStop = calculateHaversineDistanceKm(currentPos, stop.location);

    // If this is the last stop on this day
    if (i === allStops.length - 1) {
      if (distDirectToStop < 0.3 || (vehiclePathIndex >= path.length - 5 && distToRoute < 2)) {
        return {
          targetStop: stop,
          targetIndex: i,
          allStops,
          isDayPassed: true,
          distanceToTargetKm: Math.round(distDirectToStop * 10) / 10,
        };
      }
      targetIndex = i;
      break;
    }

    // Intermediate stop check
    const nextStop = allStops[i + 1];
    const nextStopDist = calculateHaversineDistanceKm(currentPos, nextStop.location);

    // Has driver passed stop `i`?
    const isPastOnPolyline = vehiclePathIndex >= stopIdxOnPath && (distDirectToStop > 0.35 || nextStopDist < distDirectToStop);
    const isArrivedAndLeaving = distDirectToStop < 0.25 && nextStopDist < distDirectToStop;

    if (isPastOnPolyline || isArrivedAndLeaving) {
      continue;
    } else {
      targetIndex = i;
      break;
    }
  }

  const activeTarget = allStops[targetIndex];
  const activeStopIdx = stopIndices[targetIndex];

  // Calculate realistic road driving distance along the route polyline if applicable
  let distanceToTarget = calculateHaversineDistanceKm(currentPos, activeTarget.location);
  if (activeStopIdx >= vehiclePathIndex && distToRoute < 5) {
    const roadDist =
      distToRoute +
      calculatePolylineDistanceKm(path, vehiclePathIndex, activeStopIdx) +
      calculateHaversineDistanceKm(path[activeStopIdx], activeTarget.location);
    if (roadDist > 0.1) {
      distanceToTarget = roadDist;
    }
  }

  return {
    targetStop: activeTarget,
    targetIndex,
    allStops,
    isDayPassed: false,
    distanceToTargetKm: Math.round(distanceToTarget * 10) / 10,
  };
}

/**
 * When entering Driving Mode or moving between days:
 * Scans all days to find the best active day and upcoming point based on current GPS coordinates.
 */
export function findActiveTripDayAndTarget(
  tripPlan: TripPlan,
  currentPos: LatLng | null,
  preferredDayIndex?: number
): {
  activeDayIndex: number;
  targetStop: DayTargetStop;
  targetIndex: number;
  allStops: DayTargetStop[];
  distanceToTargetKm: number;
} {
  const days = tripPlan.days;
  if (!days || days.length === 0) {
    throw new Error('Trip plan has no days');
  }

  // If user explicitly picked a day index and we don't have GPS, or preferred day is valid
  if (preferredDayIndex != null && preferredDayIndex >= 0 && preferredDayIndex < days.length && !currentPos) {
    const day = days[preferredDayIndex];
    const res = findUpcomingStopOnDay(day, preferredDayIndex, currentPos);
    return {
      activeDayIndex: preferredDayIndex,
      ...res,
    };
  }

  // If we have GPS coordinates: find which day the driver is on or nearest to!
  if (currentPos) {
    let bestDayIndex = 0;
    let minDayDistance = Infinity;
    let candidateResult: ReturnType<typeof findUpcomingStopOnDay> | null = null;

    for (let d = 0; d < days.length; d++) {
      const day = days[d];
      if (day.isRestDay) continue;

      const path = decodeDayPolyline(day);
      let distToDay = Infinity;

      if (path.length > 0) {
        const { distanceKm } = findClosestPointOnPath(currentPos, path);
        distToDay = distanceKm;
      } else {
        const startDist = calculateHaversineDistanceKm(currentPos, day.startLocation.location);
        const endDist = calculateHaversineDistanceKm(currentPos, day.endLocation.location);
        distToDay = Math.min(startDist, endDist);
      }

      const dayResult = findUpcomingStopOnDay(day, d, currentPos);

      // If the day is already fully passed, skip unless it's the last day
      if (dayResult.isDayPassed && d < days.length - 1) {
        continue;
      }

      // Check how close the vehicle is to this day's route line
      if (distToDay < minDayDistance) {
        minDayDistance = distToDay;
        bestDayIndex = d;
        candidateResult = dayResult;
      }
    }

    if (candidateResult) {
      return {
        activeDayIndex: bestDayIndex,
        ...candidateResult,
      };
    }
  }

  // Fallback to day 0 or preferred
  const fallbackDayIndex = preferredDayIndex ?? 0;
  const day = days[fallbackDayIndex] || days[0];
  const res = findUpcomingStopOnDay(day, fallbackDayIndex, currentPos);
  return {
    activeDayIndex: fallbackDayIndex,
    ...res,
  };
}

export interface DeviationCheckResult {
  isDeviated: boolean;
  distanceOffRouteMeters: number;
  closestPoint: LatLng | null;
  closestPathIndex: number;
}

/**
 * Checks if the driver has deviated significantly from the day's planned polyline.
 * @param currentPos Current vehicle coordinates
 * @param day The active DayPlan
 * @param thresholdMeters Deviation threshold in meters (default 200m)
 */
export function checkRouteDeviation(
  currentPos: LatLng | null,
  day: DayPlan,
  thresholdMeters = 200
): DeviationCheckResult {
  if (!currentPos) {
    return { isDeviated: false, distanceOffRouteMeters: 0, closestPoint: null, closestPathIndex: 0 };
  }

  const path = decodeDayPolyline(day);
  if (path.length === 0) {
    return { isDeviated: false, distanceOffRouteMeters: 0, closestPoint: null, closestPathIndex: 0 };
  }

  const { index, distanceKm } = findClosestPointOnPath(currentPos, path);
  const distanceMeters = Math.round(distanceKm * 1000);

  return {
    isDeviated: distanceMeters > thresholdMeters,
    distanceOffRouteMeters: distanceMeters,
    closestPoint: path[index],
    closestPathIndex: index,
  };
}

