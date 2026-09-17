---
name: test-driving-simulation
description: "Step-by-step procedure for simulating GPS telemetry and verifying the real-time turn-by-turn Driving HUD, voice prompts, off-route recalculations, and session persistence without physical driving."
argument-hint: "Test target (e.g., 'voice guidance', 'off-route reroute', 'speed alerts')"
---

# Test Driving HUD via GPS Simulation

Use this skill when developing, testing, or debugging the real-time navigation interface in [DrivingHUD.tsx](../../../src/components/DrivingHUD.tsx) and [routeProgress.ts](../../../src/lib/routeProgress.ts).

## When To Use
- Testing turn-by-turn instruction advance, maneuver countdowns, and distance meters
- Verifying speech synthesis (`voiceGuidance.ts`) trigger timings (2 km, 500 m, 100 m)
- Testing off-route detection (>200 m threshold) and automatic reroute suggestions
- Verifying trip completion, day stop arrival modals, and session restoration

## Reference Files
- [src/components/DrivingHUD.tsx](../../../src/components/DrivingHUD.tsx) — Main HUD UI, speedometer, turn arrows, voice toggle
- [src/lib/routeProgress.ts](../../../src/lib/routeProgress.ts) — Progress math, nearest segment projection, remaining ETA
- [src/lib/driveSession.ts](../../../src/lib/driveSession.ts) — Navigation session persistence (`trip_drive_session_v1`)
- [src/lib/location.ts](../../../src/lib/location.ts) — Geolocation watcher (Capacitor Native vs. Browser Web Geolocation)
- [src/lib/voiceGuidance.ts](../../../src/lib/voiceGuidance.ts) — SpeechSynthesis queue and distance debouncing

---

## Procedure

### 1. Extract Sample Route Coordinates
Decode the current day's route polyline to get a sequence of `LatLng` points:
```typescript
import { decodeDayPolyline } from '@/lib/routeProgress';
const routePoints = decodeDayPolyline(currentDay);
```

### 2. Inject Virtual GPS Telemetry
In `src/lib/location.ts` (or via browser DevTools Sensors tab):
- Override `watchPosition`: emit coordinates sequentially from `routePoints` on a 1-second interval (`setInterval`).
- Simulate speed: calculate distance between successive points divided by time to generate realistic `coords.speed` (m/s).
- Simulate heading: calculate bearing between point `N` and point `N+1`.

```typescript
// Mock position payload
const mockPosition: GeolocationPosition = {
  coords: {
    latitude: point.lat,
    longitude: point.lng,
    accuracy: 5,
    altitude: null,
    altitudeAccuracy: null,
    heading: calculatedHeading,
    speed: 16.6, // ~60 km/h
  },
  timestamp: Date.now(),
};
```

### 3. Verify Route Progress & Maneuver Triggers
1. **Instruction Progress**: Verify that as virtual distance decreases, the distance counter in `DrivingHUD` decrements smoothly.
2. **Spoken Voice Guidance**: Check that `speakManeuver()` triggers at standard notification thresholds (e.g., "In 500 meters, turn right onto Main St"). Verify debouncing prevents repeated speech loops.
3. **Arrival Detection**: Verify that when distance to the next stop drops below 30 meters, the stop is marked completed and the HUD advances to the next destination.

### 4. Test Off-Route Deviation
1. Inject a point with latitude/longitude offset by > 250 meters perpendicular to the polyline.
2. Confirm `progress.isOffRoute === true`.
3. Confirm that the UI displays the warning banner ("Off Route") and activates the "Recalculate Route" button.

### 5. Verify Session Resilience
- Refresh the page during simulated driving.
- Verify `loadDriveSession()` restores the active day index, elapsed time, and completed stops from localStorage.
