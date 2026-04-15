import { TripPlan } from './types';
import { decodePolyline } from './tripGpxExport';
import { DAY_COLORS } from './constants';

function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate a KML string from a trip plan.
 * Compatible with Google Earth, Google Maps import, and most GPS tools.
 */
export function generateKML(tripPlan: TripPlan): string {
  const lines: string[] = [];

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<kml xmlns="http://www.opengis.net/kml/2.2">');
  lines.push('<Document>');
  lines.push(`  <name>Trip Plan — ${tripPlan.totalDays} days, ${tripPlan.totalDistanceKm.toLocaleString()} km</name>`);
  lines.push(`  <description>${tripPlan.totalDays} day road trip departing ${tripPlan.departureDate}</description>`);

  // Define a style per day colour
  tripPlan.days.forEach((day, i) => {
    if (day.isRestDay) return;
    const hex = DAY_COLORS[i % DAY_COLORS.length].replace('#', '');
    // KML colour order: aabbggrr
    const kmlColor = `ff${hex.slice(4, 6)}${hex.slice(2, 4)}${hex.slice(0, 2)}`;
    lines.push(`  <Style id="day${i}">`);
    lines.push(`    <LineStyle><color>${kmlColor}</color><width>3</width></LineStyle>`);
    lines.push(`    <PolyStyle><fill>0</fill></PolyStyle>`);
    lines.push('  </Style>');
  });

  // Start placemark
  const first = tripPlan.days[0];
  lines.push('  <Placemark>');
  lines.push(`    <name>${escapeXML(first.startLocation.name.split(',')[0])}</name>`);
  lines.push(`    <description>Trip start</description>`);
  lines.push('    <Point>');
  lines.push(`      <coordinates>${first.startLocation.location.lng},${first.startLocation.location.lat},0</coordinates>`);
  lines.push('    </Point>');
  lines.push('  </Placemark>');

  // Each day: route line + end placemark
  tripPlan.days.forEach((day, i) => {
    if (day.isRestDay) return;

    // Route line
    const coords: string[] = [];
    day.polylineSegments.forEach((seg) => {
      decodePolyline(seg).forEach((pt) => {
        coords.push(`${pt.lng},${pt.lat},0`);
      });
    });

    if (coords.length > 0) {
      lines.push('  <Placemark>');
      lines.push(`    <name>Day ${day.dayNumber} route</name>`);
      lines.push(`    <styleUrl>#day${i}</styleUrl>`);
      lines.push('    <LineString>');
      lines.push('      <tessellate>1</tessellate>');
      lines.push(`      <coordinates>${coords.join('\n      ')}</coordinates>`);
      lines.push('    </LineString>');
      lines.push('  </Placemark>');
    }

    // Overnight stop placemark
    lines.push('  <Placemark>');
    lines.push(`    <name>Day ${day.dayNumber} — ${escapeXML(day.endLocation.name.split(',')[0])}</name>`);
    lines.push(`    <description>Day ${day.dayNumber}: ${day.distanceKm} km, ${Math.floor(day.durationMinutes / 60)}h ${day.durationMinutes % 60}m driving</description>`);
    lines.push('    <Point>');
    lines.push(`      <coordinates>${day.endLocation.location.lng},${day.endLocation.location.lat},0</coordinates>`);
    lines.push('    </Point>');
    lines.push('  </Placemark>');
  });

  lines.push('</Document>');
  lines.push('</kml>');

  return lines.join('\n');
}

/** Trigger a browser download of the KML file. */
export function downloadKML(kmlContent: string, filename: string = 'trip-route.kml'): void {
  const blob = new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
