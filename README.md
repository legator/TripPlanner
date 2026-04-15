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
# TripPlanner — Road‑trip itinerary planner 🚗

TripPlanner is a multi‑provider road‑trip itinerary planner that generates editable, multi‑day driving plans with hotels, gas stops, attractions, and exports. Built with Next.js + TypeScript and supports both Google Maps and HERE as routing/place providers.
1. **Node.js** 18+ installed
## Features

- Multi‑provider maps: Google Maps (Directions + Places) and HERE routing/place services
- Route planning & optimization: add waypoints and get an optimized driving order per-day
- Day splitting: automatically groups route legs into daily driving segments
- Hotel suggestions, gas & EV charging stops, attractions, and restaurant recommendations
- Traffic‑aware ETAs (Google) for future departure dates
- Weather forecasts (Open‑Meteo) on day cards
- Budget & fuel-cost summary (per‑day and total) using configurable fuel price and efficiency
- Saved trips (localStorage) and import/export (CSV, GPX, KML, iCal)
- Collaborative share: short links backed by a KV store (optional) or hash‑based share
- Editable plan: insert overnight stops, toggle rest days, and re‑optimize individual days
- Accessible UI, dark-mode-aware styles, and mobile responsive layout

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Maps / Routing | Google Maps & HERE (provider abstraction) |
| Places | Google Places API v1, HERE Browse API |
| Weather | Open‑Meteo |
| Short links / KV | Vercel KV (optional) |
| Utilities | date‑fns, @googlemaps/js-api-loader, @here/flexpolyline |

## Prerequisites

1. Node.js 18+ installed
2. API keys (one or more):
   - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — browser key for Maps JS and Places (recommended with HTTP referrer restrictions)
   - `GOOGLE_MAPS_API_KEY` — server key for Directions/Places server calls (keep secret)
   - `NEXT_PUBLIC_HERE_API_KEY` / `HERE_API_KEY` — optional HERE keys if you use HERE as a provider
   - (Optional) `KV_REST_API_URL` and `KV_REST_API_TOKEN` — to enable short‑link sharing via a KV store

   Enable the Google APIs you need in Google Cloud Console: Maps JavaScript API, Directions API, Places API, Geocoding API.
|----------|---------|---------|
## Setup

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
cp env.local.example .env.local

# 3. Add your API keys to .env.local (see Prerequisites above)

# 4. Start the development server
npm run dev
```

Open http://localhost:3000 in your browser.
│  (sidebar, cards)    │              │                      │
## How It Works

The app is split between a client UI (Maps, place autocomplete, and interactive plan editing) and a server planner (the API route that calls routing/place services and runs the trip algorithm).

High level flow:
- Client collects waypoints and settings and POSTs `/api/plan` (includes selected provider)
- Server calls the chosen routing provider (Google or HERE) to build the route and legs
- Server groups legs into daily chunks, searches nearby places (hotels, gas, attractions), and returns a `TripPlan` JSON
- Client renders the plan and allows edits (rest days, overnight stops) that are re-applied on re-plan

See `src/lib/tripPlanner.ts` and `src/lib/tripPlanEditor.ts` for the core logic.
│   ├── GoogleMapsProvider.tsx  # Maps JS API loader + context
## Usage

1. Add a starting point and destinations via the autocomplete
2. Adjust `Trip Settings` (driving limits, fuel settings, rest day interval)
3. Click `Plan My Trip` to generate the itinerary
4. Use `Details` on each day to view hotels, gas, attractions, and weather
5. Share the trip (short link) or export as CSV/GPX/KML/iCal
│   ├── DayCard.tsx             # Individual day card with all POI sections
## API Keys & Security

- Use a browser‑restricted key for `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and a server key for server-side calls.
- If enabling short‑link sharing backed by KV, set `KV_REST_API_URL` and `KV_REST_API_TOKEN` in your environment.
- Do not commit secret keys to source control.

## License

MIT

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
