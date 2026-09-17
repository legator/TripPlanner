# Trip Planner 🚗

A modern, full-featured road-trip itinerary planner and live in-car driving companion built with **Next.js 14 (App Router)**, **TypeScript**, **Tailwind CSS**, **Google Maps Platform**, and **HERE Technologies**.

---

## 🌟 Features Overview

### 1. 🚗 Live In-App "Driving Follow" Mode
- **Hands-Free In-Car HUD**: Distraction-free navigation overlay engineered for mobile car dashboard mounts (both vertical portrait and horizontal landscape).
- **Smooth 3D Camera Follow**: Automatically tracks GPS position with 3D camera pitch (45°–55°) and dynamic bearing/heading rotation in both **HERE Maps** and **Google Maps**.
- **Digital Speedometer & Compass**: High-visibility real-time speed display (km/h) with compass bearing and cardinal direction indicators.
- **Screen Wake Lock**: Automatically prevents device screens from dimming or locking while driving via the native `navigator.wakeLock` API.
- **External Navigation App Handoff**: One-tap handoff to **Google Maps**, **Apple Maps**, or **Waze** with direct routing to the upcoming waypoint.

### 2. 🧭 Dynamic Route Progress & Waypoint Auto-Advancing
- **GPS Day Auto-Detection**: Automatically identifies which day of a multi-day trip the vehicle is on based on live coordinates, eliminating getting stuck on Day 1 when already midway through the trip.
- **Polyline-Based Stop Tracking**: Projects vehicle coordinates onto the route polyline to accurately determine whether intermediate waypoints have been driven past or bypassed.
- **Immediate Target Metrics**: Displays real-time road driving distance and ETA to the *immediate next upcoming stop* rather than full-day distance.
- **Auto-Advancement on Pass**: Automatically advances to the next point upon passing a waypoint with a toast confirmation (`✅ Passed [Stop] • Next: [Next Stop]`).
- **Arrival Status**: Displays a prominent `Here! / Arrived` status when within 250 meters of the destination.
- **Automatic Day Transition**: Automatically advances to the next day when the final overnight stop is reached.
- **Manual Steppers with 1-Tap Auto Reset**: Allows manual browsing (`◀ Day X of Y ▶` and `◀ Next: [Stop] ▶`) with a pulsing `Auto ↺` button to snap back to live GPS tracking.

### 3. ⛽ Quick Stops Along Route
- **One-Tap Amenities**: Scans forward along the driving route for:
  - ⛽ **Gas Stations** (with distances and driving times)
  - 🍽️ **Restaurants & Cafes**
  - ☕ **Rest Stops & Relaxation Areas**
- **Instant Actions**: Center on map, navigate directly, or add any discovered place directly to the active trip itinerary.

### 4. 🚦 HERE Traffic API v7 Integration
- **Live Traffic Vector Flow**: Real-time traffic speed and congestion visualization on HERE Maps.
- **Incident Markers**: Live map markers for road closures (⛔), accidents (💥), construction/roadwork (🚧), hazards (⚠️), and heavy congestion (🛑).
- **Smart Corridor Splitting**: Automatically divides multi-day routes exceeding 500 km into parallel corridor queries for seamless coverage across entire continents.
- **Driving Hazard Alerts**: In-car HUD banner alerts the driver to road closures or critical incidents within 12 km ahead on the route.
- **Traffic Drawer**: Interactive incident list sorted by proximity with details on affected road length, delays, and scheduled closures.

### 5. 🗺️ Multi-Provider Support (Google Maps & HERE)
- **Map Provider Picker**: Switch seamlessly between **Google Maps Platform** and **HERE Technologies**.
- Provider abstraction covers:
  - Vector and raster maps
  - Route calculation & multi-stop polyline rendering
  - Geocoding and reverse geocoding
  - Place autocomplete and POI discovery

### 6. 📱 Mobile-First Responsive Design
- **Dual-Mode Mobile Layout**: Seamless thumb-friendly switching between Itinerary (`[📋 Itinerary]`) and Full-Screen Map (`[🗺️ Map]` / `[🚗 Drive]`).
- **Safe-Area Inset Support**: Full layout awareness (`safe-pt`, `safe-pb`) for phone notches, dynamic islands, and system gesture bars.
- **Adaptive HUD Constraints**: Responsive layouts specifically tuned for phones in both portrait and landscape car mounts.
- **Voice Navigation Prompts**: Spoken arrival and turn guidance via the native Web Speech API with persistent mute toggling.
- **Automatic Off-Route Rerouting**: Continuously monitors vehicle deviation against the planned route polyline (> 200m) and recalculates the remaining itinerary automatically.
- **Dynamic Traffic ETAs**: Route-provider live traffic duration and delay indicators (`+Xm delay`) dynamically polled from `/api/route/eta`.
- **Corridor-Matched Incidents**: Matches HERE Traffic incidents along the actual route corridor rather than just a circular radius.
- **Progress Persistence**: Saves active driving progress and targeted stops to `localStorage`, allowing the app to close and reopen seamlessly without losing state.
- **PWA & Offline Tile Caching**: Service worker caches map tiles (Google, HERE, OSM) and routing responses for reliable connectivity in rural dead zones.

### 7. ⚡ Electric Vehicle (EV) Planning & Charging
- **Battery Pack & Consumption Modeling**: Configure battery capacity (kWh), current charge %, average consumption (Wh/km), and maximum DC fast charging speed (kW).
- **Vehicle Model Presets**: Built-in presets for Tesla Model 3/Y, Volkswagen ID.4, Hyundai Ioniq 5, and custom EV setups.
- **Smart Stop Selection**: Automatically detects when battery levels drop near the minimum buffer and inserts optimal high-power charging stops along the route corridor.
- **Tapered Charging Curve Estimation**: Simulates realistic DC fast-charging duration curves (fast up to 80%, tapering past 80%) and incorporates charging stops directly into the daily schedule.
- **Live Charger Availability & Pricing**: Displays charging networks (IONITY, Tesla Supercharger, Fastned, EnBW, Allego), connector types (CCS2, Type 2, NACS, CHAdeMO), available/total stalls, and cost per kWh.

### 8. 💰 Complete Trip Ledger & Expense Management
- **Comprehensive Expense Tracking**: Log expenses across 8 dedicated categories: Fuel, EV Charging, Tolls & Vignettes, Lodging & Hotels, Food & Dining, Attractions & Tours, Parking, and Miscellaneous.
- **Multi-Currency Engine**: Support for 9 currencies (EUR, USD, GBP, CAD, AUD, JPY, CHF, PLN, UAH) with automatic reference conversion to your chosen base currency.
- **Cost Splitting & Debt Settlement**: Split expenses among individual or all travelers, with an automated debt minimization algorithm ("who owes whom").
- **Plan Pre-Population**: 1-click import of planned fuel, EV charging, hotels, and restaurant estimates directly into the ledger.
- **CSV Export**: Export full trip expense ledgers with date, category, original and converted currency amounts, payer, and split breakdown.

### 9. 🌦️ Weather & Safety Intelligence (Open-Meteo)
- **100% Open-Meteo Integration**: Free, worldwide, high-precision forecasts requiring 0 API keys.
- **Severe Weather Hazard Warnings**: Proactively flags dangerous conditions along the itinerary:
  - 💨 **High Wind & Gale Alerts** (gusts > 55–75 km/h)
  - ❄️ **Snow & Ice Hazards** (snowfall accumulation & freezing roads)
  - 🌊 **Flash Flooding & Torrential Rain** (heavy rain > 25–40 mm, hydroplaning risk)
  - 🔥 **Extreme Heat (> 38°C) & Wildfire/Smoke Risks**
  - 🧊 **Sub-Zero Freeze Warnings (< -15°C)**
- **Smart Departure Recommendations**: Analyzes hourly front progressions to recommend delaying or advancing departure times when morning or afternoon road conditions are hazardous.
- **Leg & Attraction Forecasts**: Dedicated forecast badges and hazard warnings for both intermediate tourist attractions and overnight destinations.

### 10. 📅 Smart Trip Planning & Editing
- **Intelligent Day Splitting**: Groups driving legs into realistic daily segments based on user-configured driving time and distance limits.
- **Interactive Itinerary Customization**:
  - Insert rest days (no driving)
  - Re-order stops and shift day boundaries interactively
  - Insert custom overnight stays
  - Re-optimize route order
- **Scheduled Itinerary**: Detailed daily timelines with check-out, driving legs, meal stops, sightseeing time, and hotel check-in.
- **Fuel & Budget Estimator**: Calculates estimated fuel costs based on vehicle efficiency (L/100 km) and regional fuel prices.

### 11. 💾 Storage, Export & Sharing
- **Offline & Local Storage**: Automatically saves waypoints, settings, and itinerary state to `localStorage`.
- **Export Options**:
  - **GPX** (for dedicated GPS units and handheld devices)
  - **KML** (for Google Earth and custom map viewers)
  - **CSV** (for spreadsheets and expense tracking)
  - **iCal / ICS** (adds daily itinerary schedules to Google Calendar, Apple Calendar, or Outlook)
- **Collaborative Sharing**: Share trips via encoded URL hash or optional KV short links.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | [Next.js 14](https://nextjs.org/) (App Router, Server Actions & Route Handlers) |
| **Language** | [TypeScript 5](https://www.typescriptlang.org/) |
| **Styling** | [Tailwind CSS 3](https://tailwindcss.com/) with Dark Mode & Glassmorphism |
| **Map Providers** | [Google Maps JavaScript API](https://developers.google.com/maps) & [HERE Maps API for JavaScript v3.1](https://developer.here.com/) |
| **Routing Engines** | Google Directions API & HERE Routing API v8 |
| **Places & Search** | Google Places API (New) & HERE Browse / Discover API |
| **Traffic Data** | HERE Traffic API v7 (Incidents & Real-Time Flow) |
| **Weather** | Open-Meteo Weather Forecast API |
| **Polyline Utilities** | `@googlemaps/js-api-loader`, `@here/flexpolyline` |
| **Date & Time** | `date-fns` |

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** 18.17+ or higher
- **npm**, **pnpm**, or **yarn**
- API Keys:
  - **Google Maps API Key** (Maps JavaScript API, Directions API, Places API, Geocoding API)
  - **HERE API Key** (optional, required if using HERE Maps and HERE Traffic)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/legator/TripPlanner.git
   cd TripPlanner
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Copy the example environment file:
   ```bash
   cp env.local.example .env.local
   ```
   Add your API keys to `.env.local`:
   ```env
   # Google Maps Platform
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_browser_restricted_google_key
   GOOGLE_MAPS_API_KEY=your_server_side_google_key

   # HERE Technologies (Optional for HERE Maps & Traffic v7)
   NEXT_PUBLIC_HERE_API_KEY=your_here_api_key
   HERE_API_KEY=your_here_api_key

   # Optional Map Provider Default ('google' | 'here')
   NEXT_PUBLIC_MAP_PROVIDER=here

   # Optional Vercel KV for short share links
   KV_REST_API_URL=
   KV_REST_API_TOKEN=
   ```

4. **Run the Development Server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📖 How to Use

1. **Pick Map Provider**: Choose Google Maps or HERE Maps (can be changed anytime in settings).
2. **Add Waypoints**: Enter your starting point and intermediate or final destinations using the autocomplete search.
3. **Configure Preferences**: Set your maximum daily driving hours, fuel efficiency, rest day frequency, departure date, and transport mode.
4. **Generate Itinerary**: Click **"Plan My Trip"** to produce daily driving legs, stop schedules, and lodging recommendations.
5. **Fine-Tune**: Insert overnight stops, toggle rest days, or re-order segments.
6. **Launch Driving Mode**:
   - Tap **"Driving Mode"** or the car icon (`🚗`).
   - The HUD will automatically lock onto your live GPS location, match your active day, target the next upcoming waypoint, and keep your screen awake while driving.
7. **Export or Share**: Download GPX/KML/CSV/iCal files or generate a shareable link.

---

## 📱 Mobile App (Android & iOS)

TripPlanner uses **Capacitor** to build native mobile apps for **Android** and **iOS** from the same codebase, featuring native GPS tracking, screen stay-awake, and haptic feedback.

### Android Development
1. Ensure **Android Studio** is installed.
2. Open the project in Android Studio:
   ```bash
   npm run cap:android
   ```
3. In Android Studio:
   - Connect your Android device via USB (with USB Debugging enabled) or start an Android Virtual Device (AVD).
   - Click **Run (▶)** to install and launch the debug app.
   - To build an APK for testing or Google Play release: **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**.

### iOS Development (macOS)
1. Ensure **Xcode** and CocoaPods are installed on macOS.
2. Open the project in Xcode:
   ```bash
   npm run cap:ios
   ```
3. In Xcode, select your simulator or plugged-in iPhone and click **Run (▶)**.

### Syncing Native Projects
Whenever you update plugins, Capacitor configuration, or web assets:
```bash
npm run cap:sync
```

---

## 🧪 Testing & Verification

```bash
# Type check TypeScript code
npx tsc --noEmit

# Run ESLint validation
npm run lint

# Build production bundle
npm run build
```

---

## 📄 License

This project is licensed under the **MIT License**.
