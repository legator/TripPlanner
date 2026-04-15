# TripPlanner — Copilot Workspace Instructions

## Project Overview

TripPlanner is a **Next.js 14 road-trip itinerary planner** with Google Maps integration. Users enter waypoints, configure daily driving limits, and receive multi-day itineraries with scheduled hotel stays, gas stops, attractions, and restaurants. Plans are editable (toggle rest days, shift day boundaries, add overnight stops) and exportable to CSV and GPX.

## Tech Stack

- **Framework**: Next.js 14 (App Router), React 18, TypeScript 5
- **Styling**: TailwindCSS 3
- **Maps**: Google Maps JS API (`@googlemaps/js-api-loader`), Places API v1, Directions API, Geocoding API
- **Date utilities**: date-fns 3

## File Map

| Path | Role |
|------|------|
| `src/app/page.tsx` | Root component — owns all state, orchestrates sidebar ↔ map |
| `src/app/api/plan/route.ts` | POST endpoint — validates request, calls `planTrip()`, returns `TripPlan` |
| `src/lib/types.ts` | **All shared types** — always read before adding/changing data shapes |
| `src/lib/constants.ts` | `DEFAULT_SETTINGS`, `SEARCH_RADIUS`, `DAY_COLORS`, `MARKER_ICONS` |
| `src/lib/tripPlanner.ts` | Core planning engine — route optimization, leg grouping, place search |
| `src/lib/tripPlanEditor.ts` | Post-generation edits — rest days, day-boundary shifts, re-plan merging |
| `src/lib/tripOptimization.ts` | Per-day route reordering via Directions API `optimize:true` |
| `src/lib/tripGpxExport.ts` | GPX export + `decodePolyline()` utility |
| `src/lib/tripCsvExport.ts` | CSV export (two formats: settings summary + detailed itinerary) |
| `src/components/MapView.tsx` | Google Maps rendering — polylines, markers, click-to-add waypoints |
| `src/components/GoogleMapsProvider.tsx` | Loads Maps JS API, provides context |
| `src/components/PlaceAutocomplete.tsx` | Google Places autocomplete web component |
| `src/components/Sidebar.tsx` | Left-panel shell — waypoints, settings, plan view, export |
| `src/components/TripPlanView.tsx` | Day list + summary stats |
| `src/components/DayCard.tsx` | Expandable day card — schedule, hotels, gas, attractions |
| `src/components/TripSettings.tsx` | Settings form panel |
| `src/components/WaypointList.tsx` | Waypoint add/remove/reorder |
| `src/components/PlaceCard.tsx` | Compact place display (name, rating, price) |

## Architectural Conventions

- **Types first**: All data shapes live in `types.ts`. Extend there before touching logic.
- **Constants file**: Search radii, color palettes, default settings, marker icons — always use `constants.ts`.
- **Server vs client**: `tripPlanner.ts` runs **only on the server** (Node.js, API route). Google Maps JS API code runs **only on the client** (browser).
- **Google Places API v1**: Use the new REST endpoint `https://places.googleapis.com/v1/places:searchNearby` with `X-Goog-FieldMask`. Do **not** use the legacy Places API.
- **Polyline encoding**: Use `decodePolyline()` from `tripGpxExport.ts` to decode Google-encoded polylines. Keep that utility central; do not reimpliment.
- **Time format**: All schedule times are `"HH:mm"` strings with 24-hour wrap-around arithmetic.
- **Segment model**: A day is an array of `DaySegment` objects (each = one Directions API leg). Days share a pool of segments during boundary edits.
- **Parallel place search**: Use `Promise.all()` when fetching hotels/gas/attractions/restaurants for a day — do not serialize.
- **Ref pattern**: `planWaypointsRef` and `userEditsRef` in `page.tsx` accumulate cross-render state for re-plan workflows.

## Key Interfaces (quick reference)

```typescript
Waypoint        { id, name, address, location, placeId? }
TripSettings    { maxDrivingMinutesPerDay, maxDistancePerDayKm, fuelRangeKm,
                  departureDate, avoidTolls, avoidHighways,
                  checkoutTime, checkinTime, sightseeingMinutesPerStop, restDayEvery }
DaySegment      { distanceKm, durationMinutes, startName, startLocation,
                  endName, endLocation, polylineSegments[] }
DayPlan         { dayNumber, date, isRestDay, startLocation, endLocation,
                  mainStops, distanceKm, durationMinutes, gasStops,
                  hotelSuggestions, attractions, restaurants,
                  polylineSegments[], schedule[], segments[] }
TripPlan        { days[], totalDistanceKm, totalDurationMinutes, totalDays,
                  waypointOrder[], overviewPolyline, departureDate }
```

## Google API Notes

- Always prefer `place_id` routing over lat/lng to avoid non-routable snapping.
- `ZERO_RESULTS` from Directions API means no driving route exists — surface a user-friendly message.
- `searchNearbyPlaces()` requests `displayName,formattedAddress,location,rating,priceLevel,photos,currentOpeningHours` via FieldMask.
- The Maps JS API key is read from `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`; the server-side key is `GOOGLE_MAPS_API_KEY`.
