import { TripPlan, LatLng } from './types';

/**
 * Convert encoded polyline to array of lat/lng coordinates
 * Based on Google Maps' polyline encoding algorithm
 */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let b;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    result = 0;
    shift = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({
      lat: lat / 1e5,
      lng: lng / 1e5,
    });
  }

  return points;
}

/**
 * Generate GPX XML string from trip plan
 * GPX (GPS Exchange Format) is compatible with most GPS devices and apps
 */
export function generateGPX(tripPlan: TripPlan): string {
  const now = new Date().toISOString();
  const lines: string[] = [];

  // GPX header
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<gpx version="1.1" creator="Trip Planner" xmlns="http://www.topografix.com/GPX/1/1">');
  lines.push('<metadata>');
  lines.push(`  <time>${now}</time>`);
  lines.push(`  <desc>Trip Plan - ${tripPlan.totalDays} days, ${tripPlan.totalDistanceKm} km</desc>`);
  lines.push('</metadata>');

  // Collect all track points from all days
  const trackPoints: Array<{ lat: number; lng: number; name: string }> = [];

  tripPlan.days.forEach((day) => {
    if (day.isRestDay) return;

    // Add start point
    trackPoints.push({
      ...day.startLocation.location,
      name: `Day ${day.dayNumber} Start - ${day.startLocation.name}`,
    });

    // Decode and add all polyline points
    day.polylineSegments.forEach((polylineSeg) => {
      const points = decodePolyline(polylineSeg);
      trackPoints.push(...points.map((p) => ({ ...p, name: '' })));
    });

    // Add end point
    trackPoints.push({
      ...day.endLocation.location,
      name: `Day ${day.dayNumber} End - ${day.endLocation.name}`,
    });
  });

  // Write track
  lines.push('<trk>');
  lines.push(`  <name>Trip Plan - ${tripPlan.totalDays} days</name>`);
  lines.push(`  <desc>${tripPlan.totalDistanceKm} km route</desc>`);
  lines.push('  <trkseg>');

  trackPoints.forEach((point) => {
    lines.push(`    <trkpt lat="${point.lat}" lon="${point.lng}">`);
    if (point.name) {
      lines.push(`      <name>${escapeXML(point.name)}</name>`);
    }
    lines.push('    </trkpt>');
  });

  lines.push('  </trkseg>');
  lines.push('</trk>');

  // Add waypoints for each day's start/end and major locations
  lines.push('<wpt lat="' + tripPlan.days[0].startLocation.location.lat + '" lon="' + tripPlan.days[0].startLocation.location.lng + '">');
  lines.push(`  <name>Start - ${escapeXML(tripPlan.days[0].startLocation.name)}</name>`);
  lines.push('  <sym>flag</sym>');
  lines.push('</wpt>');

  tripPlan.days.forEach((day) => {
    if (day.isRestDay) {
      lines.push(`<wpt lat="${day.endLocation.location.lat}" lon="${day.endLocation.location.lng}">`);
      lines.push(`  <name>Rest Day ${day.dayNumber} - ${escapeXML(day.endLocation.name)}</name>`);
      lines.push('  <sym>circle</sym>');
      lines.push('</wpt>');
      return;
    }

    // End of day waypoint
    lines.push(`<wpt lat="${day.endLocation.location.lat}" lon="${day.endLocation.location.lng}">`);
    lines.push(`  <name>Day ${day.dayNumber} End - ${escapeXML(day.endLocation.name)}</name>`);
    lines.push(`  <desc>${day.distanceKm} km, ${day.durationMinutes} min</desc>`);
    lines.push('  <sym>dot</sym>');
    lines.push('</wpt>');

    // Hotel suggestions as waypoints
    if (day.hotelSuggestions.length > 0) {
      lines.push(`<wpt lat="${day.hotelSuggestions[0].location.lat}" lon="${day.hotelSuggestions[0].location.lng}">`);
      lines.push(`  <name>Hotel - ${escapeXML(day.hotelSuggestions[0].name)}</name>`);
      lines.push('  <sym>lodging</sym>');
      lines.push('</wpt>');
    }
  });

  // Final destination
  const lastDay = tripPlan.days[tripPlan.days.length - 1];
  lines.push(`<wpt lat="${lastDay.endLocation.location.lat}" lon="${lastDay.endLocation.location.lng}">`);
  lines.push(`  <name>Destination - ${escapeXML(lastDay.endLocation.name)}</name>`);
  lines.push('  <sym>flag</sym>');
  lines.push('</wpt>');

  lines.push('</gpx>');

  return lines.join('\n');
}

/**
 * Escape XML special characters
 */
function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Download GPX data as a file
 */
export function downloadGPX(gpxContent: string, filename: string = 'trip-route.gpx'): void {
  const blob = new Blob([gpxContent], { type: 'application/gpx+xml;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
