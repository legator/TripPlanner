# Trip Planner 🚗

A smart road-trip itinerary planner built with **Next.js 14**, **TypeScript**, **Tailwind CSS**, and the **Google Maps Platform**.

## Features

### Planning
- **Route Optimization** — Multi-waypoint routing via Google Directions API with stop reordering
- **Daily Itinerary** — Splits trips into manageable daily segments based on max driving time/distance
- **One-Way Trips** — Support for point-to-point routes (no return leg)
- **Rest Days** — Toggle any day as a rest day; shift day boundaries interactively
- **Scheduled Itinerary** — Per-day timed schedule (departure, driving, sightseeing, check-in)

### Place Discovery
- **Hotel Suggestions** — Finds lodging near each day's endpoint
- **Gas Station Finder** — Recommends fuel stops based on your vehicle's fuel range
- **EV Charging Stations** — Locates charging stops along the route for electric vehicles
- **Attraction Discovery** — Highlights tourist attractions near your route
- **Restaurant Suggestions** — Finds places to eat along the way
- **Campgrounds** — Surfaces nearby campgrounds as an alternative to hotels

### Cost & Fuel
- **Fuel Cost Estimator** — Calculates estimated trip fuel cost from price/litre and efficiency (L/100 km)
- **Trip Cost Summary** — Shows total estimated fuel cost across all driving days

### Export & Share
- **GPX Export** — For GPS devices and navigation apps
- **KML Export** — For Google Earth and Google Maps import
- **CSV Export** — Settings summary + detailed day-by-day itinerary
- **iCal Export** — Import your trip schedule into any calendar app
- **Share via URL** — Encodes the full trip plan into a shareable link (copied to clipboard)

### UI & UX
- **Interactive Map** — Color-coded daily routes, markers for all POIs, click-to-add waypoints
- **Dark Mode** — Toggle dark/light theme (preference persisted across sessions)
- **Auto-Save** — Waypoints, settings, and plan auto-saved to localStorage; restored on reload
- **Error Boundaries** — Graceful recovery from unexpected rendering errors
- **Rate Limiting** — API endpoint capped at 10 requests/minute per IP

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 3 (with dark mode) |
| Maps | Google Maps JavaScript API |
| Routing | Google Directions API |
| Places | Google Places API v1 (Nearby Search) |
| Map Loader | @googlemaps/js-api-loader |
| Date utilities | date-fns 3 |

## Prerequisites

1. **Node.js** 18+ installed
2. A **Google Maps Platform API Key** with these APIs enabled:
   - Maps JavaScript API
   - Directions API
   - Places API (New)
   - Geocoding API

   Get your key at: https://console.cloud.google.com/google/maps-apis

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
cp env.local.example .env.local

# 3. Fill in your API keys in .env.local:
#    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=<browser key>
#    GOOGLE_MAPS_API_KEY=<server key>

# 4. Start the development server
npm run dev
```

Open http://localhost:3000 in your browser.

## Environment Variables

| Variable | Used by | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Browser | Maps JS API, Places Autocomplete |
| `GOOGLE_MAPS_API_KEY` | Server (`/api/plan`) | Directions API, Places API v1 |

> **Tip**: You can use the same key for both variables, but restricting each key to its respective usage (HTTP referrer vs. server IP) is recommended for production.

## How It Works

### Architecture

```
User Browser                          Next.js Server
┌──────────────────────┐              ┌──────────────────────┐
│  Google Maps JS API  │              │  /api/plan           │
│  (map, autocomplete) │─── POST ───▶│  ├─ Directions API   │
│                      │              │  ├─ Places API v1    │
│  React Components    │◀── JSON ────│  └─ Trip Algorithm   │
│  (sidebar, cards)    │              │                      │
└──────────────────────┘              └──────────────────────┘
```

### Trip Planning Algorithm

1. **Route Optimization** — Waypoints sent to Directions API with `optimize:true`
2. **Day Splitting** — Legs grouped into days respecting max time and distance limits
3. **Parallel Place Search** — Hotels, gas, EV charging, campgrounds, attractions, and restaurants fetched concurrently via `Promise.all()`
4. **Fuel Cost Calculation** — `(distanceKm / 100) × efficiency × price` computed per day and summed
5. **Schedule Generation** — Timed events built from checkout time, driving duration, and sightseeing minutes per stop

### Project Structure

```
src/
├── app/
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Main page — state, persistence, dark mode
│   ├── globals.css             # Global styles
│   └── api/plan/route.ts       # Trip planning API (with rate limiting)
├── components/
│   ├── ErrorBoundary.tsx       # React error boundary
│   ├── GoogleMapsProvider.tsx  # Maps JS API loader + context
│   ├── MapView.tsx             # Interactive map with markers & polylines
│   ├── Sidebar.tsx             # Left panel — waypoints, settings, exports
│   ├── PlaceAutocomplete.tsx   # Google Places autocomplete input
│   ├── WaypointList.tsx        # Manage trip waypoints
│   ├── TripSettings.tsx        # Configure trip parameters (incl. fuel)
│   ├── TripPlanView.tsx        # Day list + cost summary
│   ├── DayCard.tsx             # Individual day card with all POI sections
│   └── PlaceCard.tsx           # Compact place display
└── lib/
    ├── types.ts                # All shared TypeScript interfaces
    ├── constants.ts            # Defaults, radii, colors, marker icons
    ├── tripPlanner.ts          # Core server-side planning engine
    ├── tripPlanEditor.ts       # Rest days, day-boundary shifts
    ├── tripOptimization.ts     # Per-day route reordering
    ├── tripGpxExport.ts        # GPX export + decodePolyline utility
    ├── tripKmlExport.ts        # KML export
    ├── tripCsvExport.ts        # CSV export
    ├── tripIcalExport.ts       # iCalendar (.ics) export
    ├── tripShare.ts            # URL hash encode/decode + clipboard
    └── tripStorage.ts          # localStorage save/load/clear
```

## Usage

1. **Add Waypoints** — Search for your departure and all destinations using the autocomplete input
2. **Configure Settings** — Adjust driving limits, fuel range, fuel cost, rest-day frequency, and more
3. **Plan Trip** — Click "Plan My Trip" to generate your itinerary
4. **Explore the Plan** — Browse day-by-day cards; click "View Details" for hotels, gas, EV charging, campgrounds, and attractions
5. **Edit the Plan** — Toggle rest days, shift day boundaries interactively
6. **Export or Share** — Download GPX, KML, CSV, or iCal; or copy a share URL

## CI/CD

GitHub Actions workflows are included:

| Workflow | Trigger | Action |
|----------|---------|--------|
| `ci.yml` | Push / PR to `main` | Lint + build |
| `deploy.yml` | Push to `main` / PR | Deploy to Vercel (production / preview) |

Required GitHub Secrets for deployment: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `GOOGLE_MAPS_API_KEY`.

## Google Maps API Key Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project and enable:
   - **Maps JavaScript API**
   - **Directions API**
   - **Places API (New)**
   - **Geocoding API**
3. Create two API keys (or one shared key):
   - **Browser key** — restrict to HTTP referrers (`http://localhost:3000/*` + your production domain)
   - **Server key** — restrict to your server's IP (or leave unrestricted for development)
4. Copy both keys into `.env.local`

## License

MIT
