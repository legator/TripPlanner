# TripPlanner — AI Engineering & Architecture Guide (AGENTS.md)

Welcome to the TripPlanner codebase. This file serves as the master architectural reference and behavioral contract for all AI assistants, agents, and engineers working in this repository.

---

## 1. Project Overview & Technology Stack

TripPlanner is a full-featured road-trip itinerary planner and real-time turn-by-turn navigation system with cross-platform support (Web & Native Mobile via Capacitor).

### Core Stack
- **Framework**: Next.js 14 (App Router), React 18, TypeScript 5
- **Styling**: TailwindCSS 3 (Vanilla utility-first, dark/light aware)
- **Maps & Geolocation**: Dual Provider Architecture
  - Google Maps Platform (Maps JS API, Places API v1 `searchNearby`, Directions API, Geocoding)
  - HERE Platform (v8 JS API, Routing API v8, Geocoding & Search API v7)
- **Real-Time Navigation & Telemetry**:
  - Turn-by-Turn Driving HUD (`routeProgress.ts`, `driveSession.ts`)
  - Web Speech API for synthesized voice guidance (`voiceGuidance.ts`)
  - Screen WakeLock & Keep-Awake (`wakeLock.ts`)
- **Native Mobile Runtime**: Capacitor 8 (Android & iOS)
  - `@capacitor/geolocation`, `@capacitor/haptics`, `@capacitor/local-notifications`, `@capacitor-community/keep-awake`
- **Weather & Environmental Data**: Open-Meteo API (`weather.ts`)
- **EV Intelligence**: Electric vehicle consumption modeling & charging stop optimizer (`evPlanner.ts`)
- **Budgeting**: Multi-currency expense ledger, split costs, debt settlement (`tripLedger.ts`, `currency.ts`)
- **Caching & Quota Protection**: Upstash Redis (`redisClient.ts`, `hereQuotaGuard.ts`)
- **Export Formats**: GPX, CSV (Settings + Itinerary), KML, iCal (.ics)

---

## 2. Directory & Component Map

```
TripPlanner/
├── android/                        # Android Studio native project (Capacitor)
├── ios/                            # Xcode native project (Capacitor)
├── docs/                           # Architecture specs and Mermaid diagrams
├── .github/
│   ├── agents/                     # Specialized agent definitions (.agent.md)
│   ├── skills/                     # Procedural workflow guides (SKILL.md)
│   └── copilot-instructions.md     # GitHub Copilot workspace instructions
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── plan/route.ts       # POST: Validate stops, run planning engine
│   │   │   ├── quota/route.ts      # GET: Quota status for HERE & Google APIs
│   │   │   └── share/route.ts      # POST/GET: Redis-backed trip sharing
│   │   ├── layout.tsx              # Root layout & font configurations
│   │   └── page.tsx                # App state root; orchestrates sidebar, map, & HUD
│   ├── components/
│   │   ├── ApiStatusModal.tsx      # Quota usage & API status dashboard
│   │   ├── BudgetSummary.tsx       # Expense overview widget
│   │   ├── CityParkingModal.tsx    # City parking finder modal
│   │   ├── DayCard.tsx             # Expandable day itinerary card
│   │   ├── DrivingHUD.tsx          # Real-time full-screen turn-by-turn navigation HUD
│   │   ├── GoogleMapsProvider.tsx  # Google Maps JS API loader context
│   │   ├── HereMapsProvider.tsx    # HERE Maps JS API loader context
│   │   ├── HereMapView.tsx         # HERE Maps interactive rendering & markers
│   │   ├── HerePlaceAutocomplete.tsx # Autocomplete for HERE Geocoding/Search
│   │   ├── MapProviderPicker.tsx   # Provider switcher (Google ↔ HERE)
│   │   ├── MapView.tsx             # Google Maps interactive rendering & markers
│   │   ├── MinimizedDrivingBar.tsx # Minimized navigation banner
│   │   ├── PlaceAutocomplete.tsx   # Google Places search input
│   │   ├── PlaceCard.tsx           # Place preview card
│   │   ├── RateLimitBanner.tsx     # Quota warning banner
│   │   ├── SavedTripsPanel.tsx     # LocalStorage trip manager
│   │   ├── Sidebar.tsx             # Main control drawer (Waypoints/Settings/Plan/Export)
│   │   ├── TripLedgerModal.tsx     # Comprehensive expense tracker modal
│   │   ├── TripPlanView.tsx        # Day list container & trip stats
│   │   ├── TripSettings.tsx        # Route settings form (limits, EV, avoidances)
│   │   ├── UpdateTripModal.tsx     # Re-plan & mid-trip edit modal
│   │   ├── WaypointList.tsx        # Waypoints manager (drag-to-reorder)
│   │   └── WeatherBadge.tsx        # Weather condition badge with temperature/icon
│   └── lib/
│       ├── providers/              # Map provider abstraction layer
│       │   ├── google.ts           # Google Maps server routing & place search
│       │   ├── here.ts             # HERE Platform server routing & place search
│       │   ├── index.ts            # Provider factory (getRoutingProvider)
│       │   └── types.ts            # RoutingProvider interface & normalized types
│       ├── quota/
│       │   └── hereQuotaGuard.ts   # Redis-backed rate limiter for HERE API
│       ├── apiTracker.ts           # Client-side API call logger & metrics
│       ├── constants.ts            # DEFAULT_SETTINGS, DAY_COLORS, MARKER_ICONS
│       ├── currency.ts             # Exchange rates & multi-currency math
│       ├── driveSession.ts         # Navigation session state & localStorage recovery
│       ├── drivingNotification.ts  # Background driving notifications (Capacitor/Web)
│       ├── evPlanner.ts            # EV consumption curves & charging stops
│       ├── location.ts             # Geolocation wrapper (Capacitor + Browser fallback)
│       ├── pwa.ts                  # Service worker & PWA installation utilities
│       ├── redisClient.ts          # Upstash Redis REST client singleton
│       ├── routeProgress.ts        # Polyline projection, off-route & maneuver tracking
│       ├── savedTrips.ts           # Saved trips persistence
│       ├── tripCsvExport.ts        # CSV export (summary + detailed)
│       ├── tripGpxExport.ts        # GPX generation + canonical decodePolyline()
│       ├── tripIcalExport.ts       # iCal (.ics) calendar generation
│       ├── tripKmlExport.ts        # Google Earth KML export
│       ├── tripLedger.ts           # Expense tracking & debt simplification
│       ├── tripOptimization.ts     # Per-day waypoint reordering
│       ├── tripPlanEditor.ts       # Day splits, rest days, renumbering
│       ├── tripPlanner.ts          # Core multi-day planning algorithm
│       ├── tripPlannerClient.ts    # Frontend client for /api/plan
│       ├── tripShare.ts            # Share link generation & fetch
│       ├── tripStorage.ts          # Current trip plan localStorage cache
│       ├── types.ts                # MASTER DATA TYPES (Always check first)
│       ├── uuid.ts                 # Light UUID generator
│       ├── validation.ts           # Request validator for API routes
│       ├── voiceGuidance.ts        # SpeechSynthesis turn-by-turn voice prompts
│       ├── wakeLock.ts             # Screen Wake Lock API wrapper
│       └── weather.ts              # Open-Meteo weather client
```

---

## 3. Strict Architectural Rules & Constraints

### A. Types First
- `src/lib/types.ts` is the single source of truth for all domain entities (`TripPlan`, `DayPlan`, `DaySegment`, `Waypoint`, `TripSettings`, `EVProfile`, `Place`, `PlaceType`).
- Never introduce local interfaces that shadow or redefine domain types. Always extend `types.ts` first.

### B. Client vs. Server Separation
- **Server Only**: `tripPlanner.ts`, `providers/google.ts`, `providers/here.ts`, `redisClient.ts`, `hereQuotaGuard.ts`, `api/plan/route.ts`. Never import these into client components (`'use client'`).
- **Client Only**: Browser maps (`MapView.tsx`, `HereMapView.tsx`), web speech (`voiceGuidance.ts`), geolocation hooks, wake locks, Capacitor plugins.
- **SSR Safety**: Always guard browser-only APIs (`window`, `navigator`, `google`, `H`, `speechSynthesis`) inside `useEffect` or user interaction callbacks. Never execute them at module scope or during initial render.

### C. Map Provider Abstraction
- Never hardcode Google Maps or HERE calls directly into routing or place-search logic.
- Always use `getRoutingProvider()` from `src/lib/providers/index.ts` to access `RoutingProvider`.
- Maintain parity across both providers when adding route features (avoidances, EV attributes, tolls).

### D. Canonical Polyline Handling
- Google polylines are decoded using `decodePolyline()` from `src/lib/tripGpxExport.ts`.
- HERE polylines are decoded using `@here/flexpolyline`.
- In `routeProgress.ts`, polyline segments are normalized into flat `LatLng[]` arrays via `decodeDayPolyline()`. Never write custom ad-hoc polyline parsers.

### E. Parallel External Queries
- Never serialize independent HTTP requests (e.g., fetching hotels, gas, attractions, restaurants, and weather). Always use `Promise.all()` to prevent request timeouts.

### F. State Ownership & Cross-Render Refs
- `src/app/page.tsx` is the state root. Child components must not maintain shadow copies of trip state.
- `planWaypointsRef` and `userEditsRef` in `page.tsx` persist user customizations across iterative re-plans. Preserve these refs when modifying the planning workflow.

---

## 4. Key Workflows & Common Tasks

| Task | Skill / Agent Reference |
| :--- | :--- |
| Adding a new map engine | `.github/skills/add-map-provider/SKILL.md` |
| Simulating GPS / Testing HUD | `.github/skills/test-driving-simulation/SKILL.md` |
| Modifying EV models or charging | `.github/skills/ev-charging-strategy/SKILL.md` |
| Updating route weather | `.github/skills/route-weather-alerts/SKILL.md` |
| Building mobile apps (Android/iOS) | `.github/skills/capacitor-mobile-build/SKILL.md` |
| Debugging Redis quotas / rate limits | `.github/skills/quota-and-cache-triage/SKILL.md` |
| Working on map renderers | `.github/agents/maps-integration.agent.md` |
| Working on planning algorithms | `.github/agents/trip-algorithm.agent.md` |
| Working on UI & Modals | `.github/agents/trip-ui.agent.md` |
| Working on Driving HUD | `.github/agents/navigation-driving.agent.md` |
| Working on Mobile / Capacitor | `.github/agents/mobile-capacitor.agent.md` |
| Working on Expense / Ledger | `.github/agents/trip-financials.agent.md` |
