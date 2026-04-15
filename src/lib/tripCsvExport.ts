import { TripPlan, Waypoint, TripSettings } from './types';

export interface TripExportData {
  waypoints: Waypoint[];
  settings: TripSettings;
  tripPlan: TripPlan | null;
}

/**
 * Export trip data to CSV format
 */
export function exportTripToCSV(data: TripExportData): string {
  const lines: string[] = [];

  // Header section
  lines.push('TRIP PLANNER EXPORT');
  lines.push(`Departure Date,${data.settings.departureDate}`);
  lines.push(`Total Distance (km),${data.tripPlan?.totalDistanceKm || 0}`);
  lines.push(`Total Duration (minutes),${data.tripPlan?.totalDurationMinutes || 0}`);
  lines.push(`Total Days,${data.tripPlan?.totalDays || 0}`);
  lines.push('');

  // Settings section
  lines.push('SETTINGS');
  lines.push(`Max Driving Minutes/Day,${data.settings.maxDrivingMinutesPerDay}`);
  lines.push(`Max Distance/Day (km),${data.settings.maxDistancePerDayKm}`);
  lines.push(`Fuel Range (km),${data.settings.fuelRangeKm}`);
  lines.push(`Avoid Tolls,${data.settings.avoidTolls}`);
  lines.push(`Avoid Highways,${data.settings.avoidHighways}`);
  lines.push(`Checkout Time,${data.settings.checkoutTime}`);
  lines.push(`Checkin Time,${data.settings.checkinTime}`);
  lines.push(`Sightseeing Minutes/Stop,${data.settings.sightseeingMinutesPerStop}`);
  lines.push(`Rest Day Every N Days,${data.settings.restDayEvery}`);
  lines.push('');

  // Waypoints section
  lines.push('WAYPOINTS');
  lines.push('ID,Name,Address,Lat,Lng,PlaceID');
  data.waypoints.forEach((wp) => {
    lines.push(
      `"${wp.id}","${escapeCSV(wp.name)}","${escapeCSV(wp.address)}",${wp.location.lat},${wp.location.lng},"${wp.placeId || ''}"`
    );
  });
  lines.push('');

  // Days section
  if (data.tripPlan) {
    lines.push('DAYS');
    lines.push(
      'Day Number,Date,Is Rest Day,Start Location,End Location,Distance (km),Duration (minutes),Main Stops,Hotels,Attractions,Restaurants'
    );
    data.tripPlan.days.forEach((day) => {
      const mainStopsStr = day.mainStops.map((s) => s.name).join('; ');
      const hotelsStr = day.hotelSuggestions.map((h) => h.name).join('; ');
      const attractionsStr = day.attractions.map((a) => a.name).join('; ');
      const restaurantsStr = day.restaurants.map((r) => r.name).join('; ');

      lines.push(
        `${day.dayNumber},"${day.date}",${day.isRestDay},"${escapeCSV(day.startLocation.name)}","${escapeCSV(day.endLocation.name)}",${day.distanceKm},${day.durationMinutes},"${mainStopsStr}","${hotelsStr}","${attractionsStr}","${restaurantsStr}"`
      );
    });
  }

  return lines.join('\n');
}

/**
 * Download CSV data as a file
 */
export function downloadCSV(csvContent: string, filename: string = 'trip-plan.csv'): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Export trip itinerary in a detailed day-by-day format
 */
export function exportTripItinerary(tripPlan: TripPlan): string {
  const lines: string[] = [];

  lines.push('TRIP ITINERARY');
  lines.push(`Departure Date,${tripPlan.departureDate}`);
  lines.push(`Total Days,${tripPlan.totalDays}`);
  lines.push(`Total Distance,${tripPlan.totalDistanceKm} km`);
  lines.push(`Total Duration,${tripPlan.totalDurationMinutes} minutes`);
  lines.push('');

  tripPlan.days.forEach((day) => {
    lines.push('---');
    lines.push(`Day ${day.dayNumber} - ${day.date}`);
    lines.push(`Status,${day.isRestDay ? 'REST DAY' : 'DRIVING DAY'}`);
    lines.push(`From,${day.startLocation.name}`);
    lines.push(`To,${day.endLocation.name}`);
    if (!day.isRestDay) {
      lines.push(`Distance,${day.distanceKm} km`);
      lines.push(`Duration,${day.durationMinutes} minutes`);
      if (day.mainStops.length > 0) {
        lines.push(`Stops,"${day.mainStops.map((s) => s.name).join('; ')}"`);
      }
    }
    if (day.schedule.length > 0) {
      lines.push('Schedule:');
      day.schedule.forEach((event) => {
        const endTime = event.endTime ? `-${event.endTime}` : '';
        lines.push(
          `  ${event.time}${endTime} - ${event.icon} ${event.title} (${event.durationMinutes} min)`
        );
      });
    }
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Escape special characters in CSV fields
 */
function escapeCSV(field: string): string {
  if (!field) return '';
  return field.replace(/"/g, '""');
}
