# TripPlanner — Copilot Workspace Instructions

## Project Overview

TripPlanner is a **cross-platform road-trip itinerary planner and real-time turn-by-turn navigation system** built with Next.js 14 and Capacitor. Users enter waypoints, configure daily driving limits, vehicle preferences (including EV battery specifications), and receive multi-day itineraries with scheduled hotel stays, charging/gas stops, attractions, and restaurants. Plans are fully editable, support multi-currency budget tracking, and can be navigated in real-time via a driving HUD or exported to CSV, GPX, KML, and iCal.

## Tech Stack

- **Framework**: Next.js 14 (App Router), React 18, TypeScript 5
- **Styling**: TailwindCSS 3 (Vanilla utilities)
- **Map Providers**:
  - Google Maps Platform (`@googlemaps/js-api-loader`, Places API v1, Directions API, Geocoding API)
  - HERE Maps Platform (`@here/maps-api-for-javascript`, Routing API v8, Geocoding & Search API v7, `@here/flexpolyline`)
- **Navigation & Mobile**:
  - Turn-by-Turn HUD with Web Speech API voice guidance and Screen WakeLock
  - Capacitor 8 native bridge (`@capacitor/geolocation`, `@capacitor/haptics`, `@capacitor/local-notifications`, `@capacitor-community/keep-awake`)
- **Backend & Services**:
  - Upstash Redis (`@upstash/redis`) for route caching and HERE API quota protection
  - Open-Meteo for route-point weather forecasts

## File Map

| Path | Role |
|------|------|
| `src/app/page.tsx` | Root component — owns all state, orchestrates sidebar ↔ map ↔ HUD |
| `src/app/api/plan/route.ts` | POST endpoint — validates request, executes `planTrip()`, returns `TripPlan` |
| `src/app/api/share/route.ts` | POST/GET endpoints — Redis-backed trip sharing by unique token |
| `src/app/api/quota/route.ts` | GET endpoint — queries Upstash Redis for HERE API quota consumption |
| `src/lib/types.ts` | **All shared types** — always read before adding/changing data shapes |
| `src/lib/constants.ts` | `DEFAULT_SETTINGS`, `SEARCH_RADIUS`, `DAY_COLORS`, `MARKER_ICONS` |
| `src/lib/providers/` | Routing provider abstraction (`RoutingProvider`, `google.ts`, `here.ts`, `index.ts`) |
| `src/lib/quota/hereQuotaGuard.ts` | Redis-backed rate limiter and quota guardian for HERE API |
| `src/lib/redisClient.ts` | Upstash Redis REST singleton |
| `src/lib/evPlanner.ts` | EV battery consumption modeling, charging stops optimizer, vehicle presets |
| `src/lib/weather.ts` | Open-Meteo weather lookups and condition timeline along route points |
| `src/lib/routeProgress.ts` | Polyline progress calculation, off-route detection, maneuver tracking |
| `src/lib/driveSession.ts` | Driving state manager, trip persistence, and session recovery |
| `src/lib/voiceGuidance.ts` | SpeechSynthesis turn-by-turn spoken directions |
| `src/lib/wakeLock.ts` | Screen Wake Lock API controller |
| `src/lib/location.ts` | Cross-platform geolocation wrapper (Capacitor Native + Web fallback) |
| `src/lib/tripLedger.ts` | Multi-currency expense ledger, split costs, debt settlement |
| `src/lib/currency.ts` | Currency conversion rates and formatting |
| `src/lib/tripPlanner.ts` | Core planning engine — route optimization, leg grouping, place search |
| `src/lib/tripPlanEditor.ts` | Post-generation edits — rest days, day-boundary shifts, re-plan merging |
| `src/lib/tripOptimization.ts` | Per-day route reordering via Directions API |
| `src/lib/tripGpxExport.ts` | GPX export + canonical `decodePolyline()` utility |
| `src/lib/tripCsvExport.ts` | CSV export (summary + detailed itinerary) |
| `src/lib/tripKmlExport.ts` | Google Earth KML export |
| `src/lib/tripIcalExport.ts` | iCal (.ics) calendar export |
| `src/components/DrivingHUD.tsx` | Full-screen turn-by-turn driving interface |
| `src/components/MapView.tsx` | Google Maps rendering — polylines, markers, click-to-add waypoints |
| `src/components/HereMapView.tsx` | HERE Maps rendering — polylines, markers, click-to-add waypoints |
| `src/components/MapProviderPicker.tsx` | Dynamic switcher between Google Maps and HERE Maps |
| `src/components/TripLedgerModal.tsx` | Expense tracker and group split modal |
| `src/components/CityParkingModal.tsx`| City parking facility finder |
| `src/components/ApiStatusModal.tsx` | Real-time API quota and cache analytics dashboard |
| `src/components/Sidebar.tsx` | Left-panel shell — waypoints, settings, plan view, export |
| `src/components/DayCard.tsx` | Expandable day card — schedule, hotels, gas/charging, attractions |
| `src/components/WeatherBadge.tsx` | Route weather condition and temperature pill |

## Architectural Conventions

- **Types first**: All domain models live in `src/lib/types.ts`. Never define shadow interfaces in component files.
- **Provider Abstraction**: Always use `getRoutingProvider()` from `src/lib/providers`. Do not hardcode direct vendor API calls in the planning engine.
- **Polyline Utilities**:
  - Google polylines: `decodePolyline()` in `src/lib/tripGpxExport.ts`.
  - HERE polylines: `@here/flexpolyline`.
  - Day route normalization: `decodeDayPolyline()` in `src/lib/routeProgress.ts`.
- **SSR Safety**: Google Maps (`google.*`), HERE Maps (`H.*`), `speechSynthesis`, `navigator.wakeLock`, and `@capacitor/*` are browser/device only. Guard all calls in `useEffect` or user event callbacks.
- **Parallel Requests**: Use `Promise.all()` when fetching places, weather, and charging facilities for days.
- **State Management**: Root state lives in `src/app/page.tsx`. `planWaypointsRef` and `userEditsRef` accumulate state across iterative re-plans.

## Key Interfaces (quick reference)

```typescript
Waypoint        { id, name, address, location: { lat, lng }, placeId? }
TripSettings    { maxDrivingMinutesPerDay, maxDistancePerDayKm, fuelRangeKm,
                  departureDate, avoidTolls, avoidHighways,
                  checkoutTime, checkinTime, sightseeingMinutesPerStop, restDayEvery,
                  isEV?, evProfile? }
DayPlan         { dayNumber, date, isRestDay, startLocation, endLocation,
                  mainStops, distanceKm, durationMinutes, gasStops, evStops?,
                  hotelSuggestions, attractions, restaurants,
                  polylineSegments[], schedule[], segments[] }
TripPlan        { days[], totalDistanceKm, totalDurationMinutes, totalDays,
                  waypointOrder[], overviewPolyline, departureDate }
```
