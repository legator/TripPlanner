---
name: ev-charging-strategy
description: "Step-by-step workflow for extending Electric Vehicle (EV) route planning, vehicle presets, consumption models, charging curve calculations, and connector filtering in TripPlanner."
argument-hint: "Vehicle model or charging feature (e.g., 'Rivian R1T preset', '800V fast charging curve')"
---

# EV Charging Strategy & Vehicle Presets

Use this skill when extending electric vehicle capabilities, battery consumption algorithms, or charging stop optimization in TripPlanner.

## When To Use
- Adding new EV models to the vehicle preset library
- Adjusting consumption formulas for highway speeds, weather, or elevation
- Customizing charging stop placement intervals and target State-of-Charge (SoC) buffers
- Adding or filtering EV connector types (`CCS2`, `Tesla_Supercharger`, `Tesla_NACS`, `Type2`, `CHAdeMO`)

## Reference Files
- [src/lib/evPlanner.ts](../../../src/lib/evPlanner.ts) — Core EV planner, `EV_PRESETS`, `calculateLegConsumption()`, `planEVStopsForDay()`
- [src/lib/types.ts](../../../src/lib/types.ts) — `EVProfile`, `EVStopInfo`, `EVConnectorType`, `EVChargingSpeed`
- [src/lib/tripPlanner.ts](../../../src/lib/tripPlanner.ts) — Integration into daily itinerary generation
- [src/components/TripSettings.tsx](../../../src/components/TripSettings.tsx) — Vehicle selection UI & battery slider controls
- [src/components/DayCard.tsx](../../../src/components/DayCard.tsx) — Rendering charging stops and charging duration in the day timeline

---

## Procedure

### 1. Add Vehicle Preset to `EV_PRESETS`
In `src/lib/evPlanner.ts`:
```typescript
export const EV_PRESETS: EVCarPreset[] = [
  // ... existing presets
  {
    id: 'rivian_r1t',
    name: 'Rivian R1T Large Pack',
    batteryCapacityKWh: 135,
    consumptionWhPerKm: 280,
    maxChargingPowerKW: 220,
    preferredConnectors: ['CCS2', 'Tesla_NACS'],
  },
];
```

### 2. Understand State of Charge (SoC) Calculation
The planner monitors estimated remaining battery percentage along each day's polyline:
- **Discharge Formula**:
  $$\text{Energy Consumed (kWh)} = \frac{\text{distanceKm} \times \text{consumptionWhPerKm}}{1000}$$
- **Buffer Threshold**: When SoC falls below `minSoCPercent` (default 15%), `evPlanner` triggers a nearby search for high-speed DC fast chargers (`>= 100 kW`).
- **Target Charge**: Charges to `targetSoCPercent` (default 80%) to respect the non-linear lithium-ion charging taper curve.

### 3. Adjust Charging Curve & Duration Math
In `estimateChargingDurationMinutes()`:
- Account for power taper between 10%–80% vs 80%–100%.
- Duration is derived from charger power, vehicle max charging rate, and required kWh replenishment:
  $$\text{Hours} = \frac{\text{kWh needed}}{\min(\text{chargerKW}, \text{vehicleMaxKW})} \times \text{overheadFactor}$$

### 4. Wire Connector Filters to Place Search
Ensure search requests to Google/HERE places specify EV charging stations matching `preferredConnectors`:
- In `src/lib/providers/google.ts` and `src/lib/providers/here.ts`, query place types for electric vehicle charging stations.
- Map the resulting amenities and plug standards to `EVConnectorType`.

### 5. Verify UI Rendering
- Open `TripSettings` → Enable **Electric Vehicle** mode.
- Select your preset → Verify default battery capacity and consumption values populate.
- Plan a route exceeding vehicle range → Verify charging stops appear in `DayCard` with battery percentage indicators and estimated charging times.
