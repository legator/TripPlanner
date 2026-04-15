---
name: add-place-type
description: "Step-by-step workflow for adding a new category of place search to TripPlanner (e.g., EV charging stations, camping sites, rest areas, pharmacies). Use when asked to find, search, display, or pin a new type of location along a trip route. Touches types.ts, constants.ts, tripPlanner.ts, DayCard.tsx, and MapView.tsx."
argument-hint: "Place type name (e.g., 'EV charging station', 'campsite', 'rest area')"
---

# Add Place Type

Use this skill when adding a new category of location to search for and display in TripPlanner itineraries.

## When To Use

- "Add EV charging stops", "find campsites along route", "show rest areas", "add pharmacy search"
- Any task that requires searching for a new category of `Place` and showing it in day cards or on the map

## Reference Files (read before starting)

- [types.ts](../../../src/lib/types.ts) — `PlaceType` union, `Place`, `DayPlan`
- [constants.ts](../../../src/lib/constants.ts) — `SEARCH_RADIUS`, `MARKER_ICONS`
- [tripPlanner.ts](../../../src/lib/tripPlanner.ts) — `searchNearbyPlaces()`, `findAttractions()`, `findRestaurants()` patterns
- [DayCard.tsx](../../../src/components/DayCard.tsx) — How existing places are rendered per day
- [MapView.tsx](../../../src/components/MapView.tsx) — How markers are placed per place type

## Procedure

### 1. Read types.ts and constants.ts

Understand the full `PlaceType` union and all existing `SEARCH_RADIUS` and `MARKER_ICONS` entries before adding new ones.

### 2. Extend PlaceType in types.ts

Add the new type to the `PlaceType` union:

```typescript
// Before
export type PlaceType = 'origin' | 'destination' | 'hotel' | 'gas_station' | 'attraction' | 'restaurant';

// After (example: adding 'ev_charging')
export type PlaceType = 'origin' | 'destination' | 'hotel' | 'gas_station' | 'attraction' | 'restaurant' | 'ev_charging';
```

### 3. Add search radius to constants.ts

In `SEARCH_RADIUS`, add an entry for the new type (value in metres):

```typescript
export const SEARCH_RADIUS = {
  hotel: 15000,
  gas: 10000,
  attraction: 25000,
  restaurant: 10000,
  ev_charging: 10000,  // ← add
};
```

### 4. Add a marker icon to constants.ts

In `MARKER_ICONS`, add an emoji or symbol for the new type:

```typescript
export const MARKER_ICONS: Record<PlaceType, string> = {
  // ... existing entries ...
  ev_charging: '⚡',
};
```

### 5. Add a field to DayPlan in types.ts

Unless you want to reuse an existing field (e.g., `attractions`), add a new array field to `DayPlan`:

```typescript
export interface DayPlan {
  // ... existing fields ...
  evChargingStops: Place[];
}
```

### 6. Add the search function in tripPlanner.ts

Model the new function after `findAttractions()` or `findGasStationsAlongDay()` depending on whether the stop is route-sampled (like gas) or point-searched (like attractions):

```typescript
async function findEvChargingStops(
  location: LatLng,
  apiKey: string
): Promise<Place[]> {
  return searchNearbyPlaces(
    'electric_vehicle_charging_station',  // Google Places includedPrimaryTypes value
    location,
    SEARCH_RADIUS.ev_charging,
    apiKey
  );
}
```

Then add it to the `Promise.all()` inside `planTrip()` where days are enriched:

```typescript
const [gas, hotels, attractions, restaurants, evCharging] = await Promise.all([
  findGasStationsAlongDay(...),
  searchNearbyPlaces('hotel', ...),
  findAttractions(...),
  findRestaurants(...),
  findEvChargingStops(day.endLocation, apiKey),
]);

dayPlan.evChargingStops = evCharging;
```

### 7. Render in DayCard.tsx

Find where existing place lists (hotels, attractions) are rendered and add a section for the new type. Follow the `PlaceCard` pattern:

```tsx
{day.evChargingStops?.length > 0 && (
  <section>
    <h4>EV Charging</h4>
    {day.evChargingStops.map(place => (
      <PlaceCard key={place.id} place={place} icon="⚡" />
    ))}
  </section>
)}
```

### 8. Add markers in MapView.tsx

In the marker rendering loop in `MapView.tsx`, add handling for the new place type so stops appear on the map. Follow existing marker creation code for `hotel` or `attraction` type places.

### 9. Validate

- `PlaceType` union change is backward-compatible (only adds a member)
- The new `DayPlan` field is initialized to `[]` in `tripPlanner.ts` so rest days don't crash
- `MARKER_ICONS` record is exhaustive (TypeScript will error if a type has no icon)

## Google Places API Type Values

Common values for `includedPrimaryTypes` in the Places API v1:

| What you want | `includedPrimaryTypes` value |
|---------------|------------------------------|
| EV charging | `electric_vehicle_charging_station` |
| Campsite | `campground` |
| Rest area | `rest_stop` |
| Pharmacy | `pharmacy` |
| Supermarket | `supermarket` |
| Parking | `parking` |

Check the [Places API type list](https://developers.google.com/maps/documentation/places/web-service/place-types) for the full reference.
