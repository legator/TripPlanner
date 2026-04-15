import { DayPlan, DaySegment, TripPlan, ScheduleEvent } from './types';
import { addDays, format } from 'date-fns';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Locations where the user explicitly made edits (rest days). */
export interface UserEdits {
  /** Lat/lng of day endpoints where user manually added a rest day after. */
  restDayAfterLocs: Array<{ lat: number; lng: number }>;
}

export function emptyUserEdits(): UserEdits {
  return { restDayAfterLocs: [] };
}

const LOC_TOLERANCE = 0.008; // ~800 m — enough to match the same city

function locMatch(a: { lat: number; lng: number }, b: { lat: number; lng: number }): boolean {
  return Math.abs(a.lat - b.lat) < LOC_TOLERANCE && Math.abs(a.lng - b.lng) < LOC_TOLERANCE;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Rebuild a driving day's computed fields from its segments array. */
function rebuildDayFromSegments(day: DayPlan, checkoutTime: string, checkinTime: string): DayPlan {
  const segs = day.segments;
  if (segs.length === 0) return day; // rest day or empty

  const distanceKm = segs.reduce((s, seg) => s + seg.distanceKm, 0);
  const durationMinutes = segs.reduce((s, seg) => s + seg.durationMinutes, 0);
  const polylineSegments = segs.flatMap((seg) => seg.polylineSegments);
  const startLocation = { name: segs[0].startName, location: segs[0].startLocation };
  const endLocation = { name: segs[segs.length - 1].endName, location: segs[segs.length - 1].endLocation };
  const mainStops = segs.slice(0, -1).map((seg) => ({
    name: seg.endName,
    location: seg.endLocation,
  }));

  // Rebuild schedule
  const schedule: ScheduleEvent[] = [];
  let cursor = checkoutTime;

  schedule.push({
    type: 'checkout', time: cursor, title: 'Check out & pack the car',
    durationMinutes: 0, icon: '🧳',
  });

  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const startTime = cursor;
    cursor = addMinutesToTime(cursor, seg.durationMinutes);
    schedule.push({
      type: 'drive', time: startTime, endTime: cursor,
      title: `Drive to ${seg.endName.split(',')[0]} (${seg.distanceKm} km)`,
      durationMinutes: seg.durationMinutes, icon: '🚗',
    });

    // Lunch near midpoint
    if (i === Math.floor(segs.length / 2) && (segs.length > 1 || seg.durationMinutes > 120)) {
      schedule.push({
        type: 'lunch', time: cursor, endTime: addMinutesToTime(cursor, 60),
        title: 'Lunch break', durationMinutes: 60, icon: '🍽️',
      });
      cursor = addMinutesToTime(cursor, 60);
    }
  }

  // If arriving before check-in, add sightseeing
  const [curH, curM] = cursor.split(':').map(Number);
  const [ciH, ciM] = checkinTime.split(':').map(Number);
  if (curH * 60 + curM < ciH * 60 + ciM) {
    const freeMin = ciH * 60 + ciM - (curH * 60 + curM);
    schedule.push({
      type: 'sightseeing', time: cursor, endTime: checkinTime,
      title: `Explore ${endLocation.name.split(',')[0]}`,
      durationMinutes: freeMin, icon: '🚶',
    });
    cursor = checkinTime;
  }

  schedule.push({
    type: 'checkin', time: cursor, title: 'Check in & relax',
    durationMinutes: 0, icon: '🏨',
  });

  return {
    ...day,
    distanceKm,
    durationMinutes,
    polylineSegments,
    startLocation,
    endLocation,
    mainStops,
    schedule,
  };
}

/** Renumber all days and recalculate dates from the plan's departure date. */
function renumberDays(plan: TripPlan): TripPlan {
  const days = plan.days.map((d, i) => ({
    ...d,
    dayNumber: i + 1,
    date: format(addDays(new Date(plan.departureDate), i), 'yyyy-MM-dd'),
  }));

  const totalDistanceKm = days.reduce((s, d) => s + d.distanceKm, 0);
  const totalDurationMinutes = days.reduce((s, d) => s + d.durationMinutes, 0);

  return {
    ...plan,
    days,
    totalDistanceKm,
    totalDurationMinutes,
    totalDays: days.length,
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Toggle a rest day at the given index.
 *  - If it IS a rest day → remove it.
 *  - If it is a driving day → insert a rest day after it.
 */
export function toggleRestDay(plan: TripPlan, dayIndex: number): TripPlan {
  const days = [...plan.days];
  const day = days[dayIndex];

  if (day.isRestDay) {
    // Remove this rest day
    days.splice(dayIndex, 1);
  } else {
    // Insert a rest day after this driving day
    const restDay: DayPlan = {
      dayNumber: 0, // will be renumbered
      date: '',
      isRestDay: true,
      startLocation: day.endLocation,
      endLocation: day.endLocation,
      mainStops: [],
      distanceKm: 0,
      durationMinutes: 0,
      gasStops: [],
      hotelSuggestions: day.hotelSuggestions,
      attractions: day.attractions,
      restaurants: day.restaurants,
      evChargingStops: [],
      campgrounds: day.campgrounds ?? [],
      estimatedFuelCost: 0,
      polylineSegments: [],
      schedule: [
        { type: 'rest_day', time: '09:00', title: 'Sleep in & relax', durationMinutes: 0, icon: '😴' },
        { type: 'sightseeing', time: '10:00', endTime: '13:00', title: `Explore ${day.endLocation.name.split(',')[0]}`, durationMinutes: 180, icon: '🚶' },
        { type: 'lunch', time: '13:00', endTime: '14:00', title: 'Lunch', durationMinutes: 60, icon: '🍽️' },
        { type: 'free_time', time: '14:00', endTime: '19:00', title: 'Free time — relax, explore, recharge', durationMinutes: 300, icon: '🌿' },
      ],
      segments: [],
    };
    days.splice(dayIndex + 1, 0, restDay);
  }

  return renumberDays({ ...plan, days });
}

/** Set the end stop of a driving day by choosing how many segments it should have.
 *  The pool of available segments is this day's segments + next driving day's segments.
 *  Segments 0..newSegmentCount-1 stay in this day; the rest go to the next driving day.
 */
export function setDayEndAtSegment(
  plan: TripPlan,
  dayIndex: number,
  newSegmentCount: number,
  checkoutTime: string,
  checkinTime: string
): TripPlan {
  const days = [...plan.days.map((d) => ({ ...d, segments: [...d.segments] }))];
  const thisDay = days[dayIndex];
  if (thisDay.isRestDay || thisDay.segments.length === 0) {
    console.log('[setDayEnd] BAIL: rest day or no segments');
    return plan;
  }

  // Find the next driving day
  let nextDrivingIdx = -1;
  for (let i = dayIndex + 1; i < days.length; i++) {
    if (!days[i].isRestDay && days[i].segments.length > 0) {
      nextDrivingIdx = i;
      break;
    }
  }
  console.log('[setDayEnd] nextDrivingIdx:', nextDrivingIdx,
    nextDrivingIdx !== -1 ? 'nextDay.segs: ' + days[nextDrivingIdx].segments.length : 'NO NEXT DRIVING DAY');

  // Pool segments from this day + next driving day
  const pool = [...thisDay.segments];
  if (nextDrivingIdx !== -1) {
    pool.push(...days[nextDrivingIdx].segments);
  }

  // Clamp: at least 1 segment for this day
  newSegmentCount = Math.max(1, Math.min(newSegmentCount, pool.length));
  console.log('[setDayEnd] pool.length:', pool.length, 'clamped newSegmentCount:', newSegmentCount);

  // If nothing actually changed, bail
  if (newSegmentCount === thisDay.segments.length) {
    console.log('[setDayEnd] BAIL: same as current');
    return plan;
  }

  const thisDaySegments = pool.slice(0, newSegmentCount);
  const remainingSegments = pool.slice(newSegmentCount);

  // Update this day
  days[dayIndex].segments = thisDaySegments;
  days[dayIndex] = rebuildDayFromSegments(days[dayIndex], checkoutTime, checkinTime);

  if (nextDrivingIdx !== -1) {
    if (remainingSegments.length === 0) {
      // Next driving day is now empty — remove it.
      // Also remove any orphaned rest days between this day and the next driving day.
      const removeCount = nextDrivingIdx - dayIndex; // includes rest days in between + the next driving day
      days.splice(dayIndex + 1, removeCount);
    } else {
      days[nextDrivingIdx].segments = remainingSegments;
      days[nextDrivingIdx] = rebuildDayFromSegments(days[nextDrivingIdx], checkoutTime, checkinTime);
    }
  } else if (remainingSegments.length > 0) {
    // No next driving day existed — create one for the overflow
    const newDay: DayPlan = {
      dayNumber: 0,
      date: '',
      isRestDay: false,
      startLocation: { name: remainingSegments[0].startName, location: remainingSegments[0].startLocation },
      endLocation: {
        name: remainingSegments[remainingSegments.length - 1].endName,
        location: remainingSegments[remainingSegments.length - 1].endLocation,
      },
      mainStops: [],
      distanceKm: 0,
      durationMinutes: 0,
      gasStops: [],
      evChargingStops: [],
      campgrounds: [],
      hotelSuggestions: [],
      attractions: [],
      restaurants: [],
      polylineSegments: [],
      schedule: [],
      segments: remainingSegments,
    };
    // Insert after any rest days following this day
    let insertIdx = dayIndex + 1;
    while (insertIdx < days.length && days[insertIdx].isRestDay) insertIdx++;
    days.splice(insertIdx, 0, rebuildDayFromSegments(newDay, checkoutTime, checkinTime));
  }

  return renumberDays({ ...plan, days });
}
// ─── Re-apply user edits after a full re-plan ───────────────────────────────

/** Re-apply user edits (rest days) on top of a freshly generated plan.
 *  Inserts rest days at user-chosen locations if not already present.
 */
export function applyUserEdits(
  plan: TripPlan,
  edits: UserEdits,
  checkoutTime: string,
  checkinTime: string
): TripPlan {
  let result = plan;

  // Insert rest days — process from end to avoid index shifting
  const restDayInsertions: number[] = [];
  for (const loc of edits.restDayAfterLocs) {
    const dayIndex = result.days.findIndex(
      (d) =>
        !d.isRestDay &&
        locMatch(d.endLocation.location, loc)
    );
    if (dayIndex !== -1) {
      // Only add if a rest day doesn't already follow this day
      const nextDay = result.days[dayIndex + 1];
      if (!nextDay?.isRestDay) {
        restDayInsertions.push(dayIndex);
      }
    }
  }
  restDayInsertions.sort((a, b) => b - a);
  for (const idx of restDayInsertions) {
    result = toggleRestDay(result, idx);
  }

  return result;
}

// ─── Route Optimization ────────────────────────────────────────────────────

/** Apply optimized segments to a day (reordered for efficiency).
 *  Replaces the day's segments with optimized ones and rebuilds computed fields.
 */
export function applyOptimizedSegments(
  plan: TripPlan,
  dayIndex: number,
  optimizedSegments: DaySegment[],
  checkoutTime: string,
  checkinTime: string
): TripPlan {
  const days = [...plan.days.map((d) => ({ ...d, segments: [...d.segments] }))];
  const day = days[dayIndex];

  if (day.isRestDay || optimizedSegments.length === 0) {
    return plan;
  }

  console.log('[applyOptimized] dayIndex:', dayIndex, 'segments before:', day.segments.length, 'after:', optimizedSegments.length);

  // Replace segments and rebuild the day
  days[dayIndex].segments = optimizedSegments;
  days[dayIndex] = rebuildDayFromSegments(days[dayIndex], checkoutTime, checkinTime);

  return renumberDays({ ...plan, days });
}