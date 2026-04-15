import { TripPlan, DayPlan } from './types';

function escapeICS(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Convert a date string ("yyyy-MM-dd") and "HH:mm" time into an
 * iCalendar DATE-TIME value in local time (no timezone — FORM #1).
 */
function toICSDateTime(dateStr: string, time: string): string {
  const [y, m, d] = dateStr.split('-');
  const [h, min] = time.split(':');
  return `${y}${m}${d}T${h}${min}00`;
}

function buildEvent(uid: string, summary: string, description: string, dateStr: string, startTime: string, endTime: string): string {
  const dtStart = toICSDateTime(dateStr, startTime);
  const dtEnd = toICSDateTime(dateStr, endTime);
  const now = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15);

  return [
    'BEGIN:VEVENT',
    `UID:${uid}@tripplanner`,
    `DTSTAMP:${now}Z`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeICS(summary)}`,
    `DESCRIPTION:${escapeICS(description)}`,
    'END:VEVENT',
  ].join('\r\n');
}

/**
 * Generate an iCalendar (.ics) string from a trip plan.
 * Creates one event per day (and extra events for hotels/attractions when available).
 */
export function generateICS(tripPlan: TripPlan): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TripPlanner//TripPlanner//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:Trip Plan — ${tripPlan.totalDays} days`,
    `X-WR-CALDESC:${tripPlan.totalDistanceKm.toLocaleString()} km road trip departing ${tripPlan.departureDate}`,
  ];

  tripPlan.days.forEach((day: DayPlan, i: number) => {
    if (day.isRestDay) {
      // Rest day — one full-day leisure event
      lines.push(buildEvent(
        `rest-${i}`,
        `🌿 Day ${day.dayNumber} — Rest Day in ${day.startLocation.name.split(',')[0]}`,
        'No driving today. Relax and explore!',
        day.date,
        '09:00',
        '20:00',
      ));
      return;
    }

    // Main driving event
    const firstEvent = day.schedule[0];
    const lastEvent = day.schedule[day.schedule.length - 1];
    const startTime = firstEvent?.time ?? '10:00';
    const endTime = lastEvent?.endTime ?? lastEvent?.time ?? '19:00';

    const hotelName = day.hotelSuggestions[0]?.name;
    const desc = [
      `${day.distanceKm} km · ${Math.floor(day.durationMinutes / 60)}h ${day.durationMinutes % 60}m driving`,
      `From: ${day.startLocation.name.split(',')[0]}`,
      `To: ${day.endLocation.name.split(',')[0]}`,
      hotelName ? `Hotel suggestion: ${hotelName}` : '',
    ].filter(Boolean).join('\n');

    lines.push(buildEvent(
      `drive-${i}`,
      `🚗 Day ${day.dayNumber} — ${day.startLocation.name.split(',')[0]} → ${day.endLocation.name.split(',')[0]}`,
      desc,
      day.date,
      startTime,
      endTime,
    ));

    // Hotel check-in reminder (if available)
    if (hotelName) {
      const checkin = day.schedule.find((e) => e.type === 'checkin');
      const checkinTime = checkin?.time ?? '15:00';
      lines.push(buildEvent(
        `hotel-${i}`,
        `🏨 Check in — ${hotelName}`,
        `Hotel: ${hotelName}\n${day.hotelSuggestions[0]?.address ?? ''}`,
        day.date,
        checkinTime,
        checkinTime,
      ));
    }
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/** Trigger a browser download of the ICS file. */
export function downloadICS(icsContent: string, filename: string = 'trip-plan.ics'): void {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
