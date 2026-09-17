---
name: route-weather-alerts
description: "Step-by-step workflow for integrating Open-Meteo weather forecasts, caching route weather data, mapping WMO weather codes, and rendering weather badges and severe weather alerts in TripPlanner."
argument-hint: "Weather feature (e.g., 'precipitation timeline', 'severe snow warning', 'wind speed alert')"
---

# Route Weather & Forecast Alerts

Use this skill when enhancing weather integration, adding adverse driving condition warnings, or customizing forecast badges along trip routes.

## When To Use
- Adding forecast timelines for intermediate waypoints and overnight stops
- Implementing warnings for adverse road conditions (snow, freezing rain, heavy precipitation, high crosswinds)
- Updating WMO weather code mappings and visual badges in [WeatherBadge.tsx](../../../src/components/WeatherBadge.tsx)
- Caching weather forecast data to minimize external API roundtrips

## Reference Files
- [src/lib/weather.ts](../../../src/lib/weather.ts) — Open-Meteo API client, WMO code interpretation, weather caching
- [src/components/WeatherBadge.tsx](../../../src/components/WeatherBadge.tsx) — Weather pill component displaying temperature, icon, and description
- [src/components/DayCard.tsx](../../../src/components/DayCard.tsx) — Where day destination weather is displayed
- [src/lib/types.ts](../../../src/lib/types.ts) — `DayPlan`, `WeatherSummary`, `WeatherCondition`

---

## Procedure

### 1. Open-Meteo Endpoint & Parameters
Open-Meteo provides free forecast APIs without an API key:
`https://api.open-meteo.com/v1/forecast`

Key query parameters:
- `latitude`, `longitude`: Target waypoint coordinates
- `daily`: `weather_code`, `temperature_2m_max`, `temperature_2m_min`, `precipitation_sum`, `wind_speed_10m_max`
- `hourly`: `temperature_2m`, `precipitation_probability`, `weather_code`
- `timezone`: `auto`

### 2. Map WMO Weather Interpretation Codes
In `src/lib/weather.ts`, WMO codes (0–99) map to semantic states:
- `0`: Clear Sky ☀️
- `1, 2, 3`: Mainly Clear, Partly Cloudy, Overcast ⛅ / ☁️
- `45, 48`: Fog and depositing rime fog 🌫️
- `51–55`: Drizzle (Light to Dense) 🌦️
- `61–65`: Rain (Slight to Heavy) 🌧️
- `66, 67`: Freezing Rain ❄️🌧️ *(High hazard)*
- `71–75`: Snow Fall 🌨️ *(High hazard)*
- `95, 96, 99`: Thunderstorm with or without Hail ⛈️ *(Severe hazard)*

### 3. Implement Hazard / Alert Detection
Evaluate conditions to flag hazard warnings in `DayPlan`:
```typescript
export function evaluateDrivingHazard(weather: WeatherSummary): { isHazard: boolean; reason?: string } {
  if ([66, 67, 71, 73, 75, 85, 86].includes(weather.weatherCode)) {
    return { isHazard: true, reason: 'Risk of ice or snow on road surface' };
  }
  if (weather.maxWindSpeedKmh && weather.maxWindSpeedKmh > 75) {
    return { isHazard: true, reason: 'High crosswind warning (>75 km/h)' };
  }
  return { isHazard: false };
}
```

### 4. Cache Lookups
To avoid duplicate requests for nearby stops on the same day:
- Round coordinates to 2 decimal places (~1.1 km precision) to form a cache key: `${lat.toFixed(2)}_${lng.toFixed(2)}_${dateStr}`.
- Store results in an in-memory `Map` or Redis with an 8-hour TTL.

### 5. Render Badges & Alerts in UI
In `DayCard.tsx`:
- Render `<WeatherBadge weather={day.weather} />` in the day header.
- If `hazard.isHazard` is true, display an amber/red warning banner recommending daylight driving or winter equipment.
