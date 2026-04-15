# Trip Planner 🚗

A smart road trip planning application built with **Next.js**, **TypeScript**, **Tailwind CSS**, and the **Google Maps Platform**.

## Features

- **Route Planning** — Add multiple destinations and get an optimized driving route
- **Daily Itinerary** — Automatically splits your trip into manageable daily segments based on your max driving time/distance preferences
- **Hotel Suggestions** — Finds lodging near each day's end point
- **Gas Station Finder** — Recommends fuel stops along the route based on your car's fuel range
- **Attraction Discovery** — Highlights tourist attractions and points of interest near your route
- **Restaurant Suggestions** — Finds places to eat along the way
- **Interactive Map** — Visual route display with color-coded daily segments, markers for all points of interest
- **Trip Settings** — Configure max driving hours, max distance per day, fuel range, departure date, avoid tolls/highways, and round-trip option

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Maps | Google Maps JavaScript API |
| Routing | Google Directions API |
| Places | Google Places API (Nearby Search) |
| Map Loader | @googlemaps/js-api-loader |

## Prerequisites

1. **Node.js** 18+ installed
2. A **Google Maps Platform API Key** with the following APIs enabled:
   - Maps JavaScript API
   - Directions API
   - Places API
   - Geocoding API

   Get your key at: https://console.cloud.google.com/google/maps-apis

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
cp env.local.example .env.local

# 3. Add your Google Maps API key to .env.local
# Edit .env.local and replace "your_google_maps_api_key_here" with your actual key

# 4. Start the development server
npm run dev
```

Open http://localhost:3000 in your browser.

## How It Works

### Architecture

```
User Browser                          Next.js Server
┌──────────────────────┐              ┌──────────────────────┐
│  Google Maps JS API  │              │  /api/plan           │
│  (map, autocomplete) │─── POST ───▶│  ├─ Directions API   │
│                      │              │  ├─ Places API       │
│  React Components    │◀── JSON ────│  └─ Trip Algorithm   │
│  (sidebar, cards)    │              │                      │
└──────────────────────┘              └──────────────────────┘
```

### Trip Planning Algorithm

1. **Route Optimization**: Sends all waypoints to Google Directions API with `optimize:true` to find the most efficient route order
2. **Day Splitting**: Groups route legs into daily segments based on your configured max driving time and distance limits
3. **Hotel Search**: For each day's endpoint, searches for nearby hotels/lodging within 15 km
4. **Gas Station Planning**: Based on your car's fuel range, samples points along the route at 70% fuel intervals and finds nearby gas stations
5. **Attraction Discovery**: Finds tourist attractions near the midpoint and endpoint of each day's route
6. **Restaurant Search**: Locates restaurants near the midpoint of each day's drive

### Project Structure

```
src/
├── app/
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Main page (state management)
│   ├── globals.css             # Global styles
│   └── api/plan/route.ts       # Trip planning API endpoint
├── components/
│   ├── GoogleMapsProvider.tsx   # Google Maps JS API loader + context
│   ├── MapView.tsx             # Interactive map with markers & routes
│   ├── Sidebar.tsx             # Main sidebar container
│   ├── PlaceAutocomplete.tsx   # Google Places autocomplete input
│   ├── WaypointList.tsx        # Manage trip stops
│   ├── TripSettings.tsx        # Configure trip parameters
│   ├── TripPlanView.tsx        # Trip plan display with day cards
│   ├── DayCard.tsx             # Individual day itinerary card
│   └── PlaceCard.tsx           # Place information card
└── lib/
    ├── types.ts                # TypeScript interfaces
    ├── constants.ts            # App constants & defaults
    └── tripPlanner.ts          # Core trip planning algorithm
```

## Usage

1. **Add Starting Point** — Search for your departure location using the autocomplete input
2. **Add Destinations** — Add all the places you want to visit
3. **Configure Settings** (optional) — Click "Trip Settings" to adjust driving preferences
4. **Plan Trip** — Click "Plan My Trip" to generate your itinerary
5. **Explore the Plan** — Browse day-by-day cards, click "Details" for hotels/gas/attractions, click places to open in Google Maps

## Google Maps API Key Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable these APIs:
   - **Maps JavaScript API**
   - **Directions API**
   - **Places API**
   - **Geocoding API**
4. Create credentials → API Key
5. (Recommended) Restrict the key:
   - For browser: HTTP referrers restriction → `http://localhost:3000/*`
   - For production: add your domain
6. Copy the key to your `.env.local` file

## License

MIT
