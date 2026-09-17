# TripPlanner

A web and mobile road trip planning application with multi-day route generation, live in-car navigation mode, and traffic monitoring.

## Features

- **Multi-Day Route Planning**: Automatically splits long routes into daily segments based on preferred driving hours, stop intervals, and rest days.
- **In-Car Driving Mode**: Full-screen HUD with live GPS tracking, 3D map follow, digital speedometer, and offline-capable voice guidance.
- **Multi-Provider Maps**: Supports both Google Maps Platform and HERE Technologies for routing, geocoding, and map rendering.
- **Traffic & Parking**: Real-time traffic flow and incident alerts via HERE Traffic API v7, plus parking and rest stop discovery.
- **Expense & EV Tools**: Trip ledger with multi-currency expense splitting, EV charging corridor planning, and fuel cost estimators.
- **Offline Caching & Export**: LocalStorage state persistence, PWA service worker caching for map tiles, and export to GPX, KML, and ICS.

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Google Maps Platform & HERE Technologies APIs
- Capacitor (for Android & iOS builds)

## Getting Started

### Prerequisites

- Node.js 18.17 or higher
- npm, yarn, or pnpm
- Google Maps API key and/or HERE API key

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/legator/TripPlanner.git
   cd TripPlanner
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp env.local.example .env.local
   ```
   Add your API keys to `.env.local`:
   ```env
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_key
   GOOGLE_MAPS_API_KEY=your_google_maps_key

   NEXT_PUBLIC_HERE_API_KEY=your_here_api_key
   HERE_API_KEY=your_here_api_key

   NEXT_PUBLIC_MAP_PROVIDER=here
   ```

### Development

Run the development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

Create an optimized production build:
```bash
npm run build
npm run start
```

### Mobile (Android & iOS)

To sync and run native mobile builds with Capacitor:

```bash
# Sync web build to native platforms
npm run cap:sync

# Open Android project in Android Studio
npm run cap:android

# Open iOS project in Xcode (macOS only)
npm run cap:ios
```

## License

MIT
