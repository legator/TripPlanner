---
name: add-export-format
description: "Step-by-step workflow for adding a new trip export format to TripPlanner (e.g., KML, GeoJSON, iCal, PDF). Use when asked to add a new export type, download format, or file generation feature. Covers creating the lib file, wiring up the download function, and adding the export button to the Sidebar."
argument-hint: "Format name (e.g., 'KML', 'GeoJSON', 'iCal')"
---

# Add Export Format

Use this skill when implementing a new file export format for TripPlanner trip plans.

## When To Use

- "Add KML export", "export to GeoJSON", "add calendar export", "download as PDF"
- Any task involving generating a new file format from a `TripPlan` object

## Reference Files (read before starting)

- [tripGpxExport.ts](../../../src/lib/tripGpxExport.ts) — GPX export pattern to follow; also holds `decodePolyline()`
- [tripCsvExport.ts](../../../src/lib/tripCsvExport.ts) — CSV export pattern (two-format approach)
- [types.ts](../../../src/lib/types.ts) — `TripPlan`, `DayPlan`, `DaySegment` shapes
- [Sidebar.tsx](../../../src/components/Sidebar.tsx) — Where export buttons live

## Procedure

### 1. Read existing exporters

Read `tripGpxExport.ts` and `tripCsvExport.ts` in full to understand the export pattern before writing new code.

### 2. Create the exporter file

Create `src/lib/trip<Format>Export.ts` (e.g., `tripKmlExport.ts`). Implement these two exports:

```typescript
// Generate the file content as a string
export function generate<Format>(tripPlan: TripPlan): string { ... }

// Trigger browser download
export function download<Format>(tripPlan: TripPlan): void {
  const content = generate<Format>(tripPlan);
  const blob = new Blob([content], { type: '<mime-type>' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trip-plan.${extension}`;
  a.click();
  URL.revokeObjectURL(url);
}
```

**MIME types**:
| Format | MIME | Extension |
|--------|------|-----------|
| KML | `application/vnd.google-earth.kml+xml` | `.kml` |
| GeoJSON | `application/geo+json` | `.geojson` |
| iCal | `text/calendar` | `.ics` |
| CSV | `text/csv` | `.csv` |
| GPX | `application/gpx+xml` | `.gpx` |

### 3. Use decodePolyline for GPS formats

For formats that need lat/lng coordinates (KML, GeoJSON, GPX-like), import and use the existing decoder:

```typescript
import { decodePolyline } from './tripGpxExport';

// Decode all polyline segments from a day
const points = day.polylineSegments.flatMap(encoded => decodePolyline(encoded));
```

Never reimplement the polyline decoder.

### 4. Add the export button to Sidebar.tsx

In `src/components/Sidebar.tsx`, locate the existing export buttons section (search for `downloadGPX` or `downloadCSV`). Add a new button following the existing button pattern:

```tsx
import { download<Format> } from '../lib/trip<Format>Export';

// In JSX, alongside existing export buttons:
<button
  onClick={() => download<Format>(tripPlan!)}
  className="..."
>
  Export <Format>
</button>
```

### 5. Validate

- Confirm `generate<Format>()` produces valid output for a sample `TripPlan`
- Confirm the `download<Format>()` function creates a valid Blob with the correct MIME type
- Confirm the button only appears when `tripPlan` is non-null

## Notes

- The exporter file runs **client-side only** (uses `document`, `URL`, `Blob`) — do not import it in server files
- `TripPlan.days` may include rest days (`isRestDay: true`) — skip or handle them appropriately per format
- `DayPlan.polylineSegments` is an array of Google-encoded polyline strings, not raw coordinates
