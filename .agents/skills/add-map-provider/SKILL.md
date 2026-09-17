---
name: add-map-provider
description: "Step-by-step workflow for integrating a new map provider into TripPlanner's dual-engine architecture (e.g., Mapbox, MapLibre, TomTom, Valhalla). Touches src/lib/providers/, MapProviderPicker.tsx, and creates dedicated Provider and MapView components."
argument-hint: "Provider name (e.g., 'mapbox', 'maplibre', 'tomtom')"
---

# Add Map Provider

Use this skill when adding a new routing and map display engine alongside Google Maps and HERE Maps.

## When To Use
- "Add Mapbox support", "integrate OpenStreetMap/Valhalla", "support TomTom routing"
- Adding a fallback mapping service for regions where Google or HERE have restricted coverage or high costs

## Reference Files
- [src/lib/providers/types.ts](../../../src/lib/providers/types.ts) — Master `RoutingProvider`, `RouteResult`, `RouteLeg`, `NearbyPlace` interfaces
- [src/lib/providers/index.ts](../../../src/lib/providers/index.ts) — Provider factory & active provider selector
- [src/lib/providers/google.ts](../../../src/lib/providers/google.ts) — Google implementation reference
- [src/lib/providers/here.ts](../../../src/lib/providers/here.ts) — HERE implementation reference
- [src/components/MapProviderPicker.tsx](../../../src/components/MapProviderPicker.tsx) — UI selector for map engines
- [src/components/HereMapView.tsx](../../../src/components/HereMapView.tsx) — Client-side map component implementation reference

---

## Procedure

### 1. Review Provider Interface (`src/lib/providers/types.ts`)
Ensure your provider can fulfill the `RoutingProvider` contract:
```typescript
export interface RoutingProvider {
  getRoute(
    origin: Waypoint,
    destination: Waypoint,
    intermediates: Waypoint[],
    settings: TripSettings
  ): Promise<RouteResult>;

  searchNearby(
    location: { lat: number; lng: number },
    type: string,
    radius: number,
    maxResults?: number
  ): Promise<NearbyPlace[]>;
}
```

### 2. Implement Server Provider (`src/lib/providers/<name>.ts`)
Create `src/lib/providers/<name>.ts`:
- Make HTTP calls to the provider's routing & geocoding/places APIs.
- Normalize the response into `RouteResult`:
  - `legs`: Array of `RouteLeg` objects with steps, duration, and distance.
  - `overviewPolyline`: Standard encoded polyline string.
  - `waypointOrder`: Array of optimized indices.
- Map vendor-specific place categories to standard `PlaceType` strings (`hotel`, `gas_station`, `restaurant`, `attraction`, `ev_charging`).
- Gracefully handle quota exhaustion (throw `QuotaExceededError` if applicable).

### 3. Register in Provider Index (`src/lib/providers/index.ts`)
```typescript
// 1. Extend the MapProviderName union:
export type MapProviderName = 'google' | 'here' | '<name>';

// 2. Import and return the new provider in getRoutingProvider():
export function getRoutingProvider(preferred?: MapProviderName): RoutingProvider {
  const name = preferred ?? getMapProviderName();
  if (name === '<name>') return <name>Provider;
  return name === 'here' ? hereProvider : googleProvider;
}
```

### 4. Create Client-Side Provider & MapView Components
1. `src/components/<Name>MapsProvider.tsx`:
   - Loads the vendor's JavaScript SDK asynchronously.
   - Provides an SDK context for child components.
2. `src/components/<Name>MapView.tsx`:
   - Renders interactive map canvas.
   - Cleans up markers (`markersRef`) and polylines (`polylinesRef`) on each update.
   - Supports `onAddWaypoint(latLng)` on canvas click.
   - Applies day color coding from `DAY_COLORS` (`constants.ts`).

### 5. Wire into UI Switcher (`src/components/MapProviderPicker.tsx`)
Add the new option to the selector UI and wire up the active provider state in `src/app/page.tsx`.
