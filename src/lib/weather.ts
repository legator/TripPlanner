'use client';

export type WeatherHazardType =
  | 'wind'
  | 'snow_ice'
  | 'flooding'
  | 'wildfire_smoke'
  | 'extreme_heat'
  | 'extreme_cold';

export interface WeatherAlert {
  id: string;
  type: WeatherHazardType;
  severity: 'critical' | 'warning' | 'advisory';
  title: string;
  message: string;
  icon: string;
}

export interface DayWeather {
  date: string;
  tempMaxC: number;
  tempMinC: number;
  precipitationMm: number;
  windspeedKmh: number;
  windGustsKmh: number;
  snowfallCm: number;
  weatherCode: number; // WMO code
  alerts: WeatherAlert[];
  departureAdvice?: string;
}

/** WMO weather interpretation codes → emoji + label */
export function describeWeather(code: number): { emoji: string; label: string } {
  if (code === 0) return { emoji: '☀️', label: 'Clear' };
  if (code === 1) return { emoji: '🌤️', label: 'Mainly clear' };
  if (code === 2) return { emoji: '⛅', label: 'Partly cloudy' };
  if (code === 3) return { emoji: '☁️', label: 'Overcast' };
  if (code === 45 || code === 48) return { emoji: '🌫️', label: 'Fog' };
  if (code >= 51 && code <= 55) return { emoji: '🌧️', label: 'Drizzle' };
  if (code >= 56 && code <= 57) return { emoji: '🌧️', label: 'Freezing drizzle' };
  if (code >= 61 && code <= 65) return { emoji: '🌧️', label: 'Rain' };
  if (code >= 66 && code <= 67) return { emoji: '🌧️', label: 'Freezing rain' };
  if (code >= 71 && code <= 75) return { emoji: '❄️', label: 'Snow' };
  if (code === 77) return { emoji: '🌨️', label: 'Snow grains' };
  if (code >= 80 && code <= 82) return { emoji: '🌦️', label: 'Rain showers' };
  if (code >= 85 && code <= 86) return { emoji: '🌨️', label: 'Snow showers' };
  if (code === 95) return { emoji: '⛈️', label: 'Thunderstorm' };
  if (code >= 96 && code <= 99) return { emoji: '⛈️', label: 'Severe thunderstorm with hail' };
  return { emoji: '🌡️', label: 'Unknown' };
}

/**
 * Computes safety alerts based on daily weather metrics.
 */
export function evaluateWeatherAlerts(
  tempMaxC: number,
  tempMinC: number,
  precipitationMm: number,
  windspeedKmh: number,
  windGustsKmh: number,
  snowfallCm: number,
  weatherCode: number
): WeatherAlert[] {
  const alerts: WeatherAlert[] = [];

  // 1) Wind & Gale Alerts
  if (windGustsKmh >= 75 || windspeedKmh >= 60) {
    alerts.push({
      id: 'gale_warning',
      type: 'wind',
      severity: 'critical',
      title: 'Severe Gale Warning',
      message: `Dangerous crosswinds (gusts up to ${windGustsKmh} km/h). High-sided vehicles take extreme caution.`,
      icon: '💨',
    });
  } else if (windGustsKmh >= 55 || windspeedKmh >= 45) {
    alerts.push({
      id: 'wind_advisory',
      type: 'wind',
      severity: 'warning',
      title: 'High Wind Advisory',
      message: `Bustling wind gusts up to ${windGustsKmh} km/h along route.`,
      icon: '💨',
    });
  }

  // 2) Snow & Ice Hazard
  if (snowfallCm >= 5 || weatherCode === 75 || weatherCode === 86) {
    alerts.push({
      id: 'heavy_snow',
      type: 'snow_ice',
      severity: 'critical',
      title: 'Heavy Snowfall & Ice Hazard',
      message: `Accumulating snowfall (~${snowfallCm} cm). Reduced visibility, snow chains or winter tires required.`,
      icon: '❄️',
    });
  } else if (snowfallCm >= 0.8 || (weatherCode >= 71 && weatherCode <= 77) || weatherCode === 66 || weatherCode === 67) {
    alerts.push({
      id: 'light_snow_ice',
      type: 'snow_ice',
      severity: 'warning',
      title: 'Snow & Freezing Road Advisory',
      message: `Slick road conditions with freezing precipitation/snow. Increase following distance.`,
      icon: '❄️',
    });
  }

  // 3) Flooding & Torrential Rain
  if (precipitationMm >= 40 || weatherCode === 65 || weatherCode === 82 || weatherCode >= 96) {
    alerts.push({
      id: 'flood_warning',
      type: 'flooding',
      severity: 'critical',
      title: 'Flash Flooding & Torrential Rain',
      message: `Intense precipitation (${precipitationMm} mm). High risk of hydroplaning and standing water.`,
      icon: '🌊',
    });
  } else if (precipitationMm >= 22) {
    alerts.push({
      id: 'heavy_rain_warning',
      type: 'flooding',
      severity: 'warning',
      title: 'Heavy Rain Warning',
      message: `Heavy rain expected (${precipitationMm} mm). Low visibility on highway stretches.`,
      icon: '🌧️',
    });
  }

  // 4) Extreme Temperature Alerts
  if (tempMaxC >= 38) {
    alerts.push({
      id: 'extreme_heat',
      type: 'extreme_heat',
      severity: 'warning',
      title: 'Extreme Heat Wave',
      message: `Highs of ${tempMaxC}°C. Check coolant, tire pressures, and carry ample drinking water.`,
      icon: '🔥',
    });
  } else if (tempMinC <= -15) {
    alerts.push({
      id: 'extreme_cold',
      type: 'extreme_cold',
      severity: 'warning',
      title: 'Extreme Sub-Zero Freeze',
      message: `Lows plunge to ${tempMinC}°C. Significant EV battery range reduction and black ice hazard.`,
      icon: '🧊',
    });
  }

  // 5) Wildfire / Smoke Advisory
  if (tempMaxC >= 34 && windspeedKmh >= 35 && precipitationMm <= 0.2) {
    alerts.push({
      id: 'wildfire_risk',
      type: 'wildfire_smoke',
      severity: 'advisory',
      title: 'Elevated Wildfire & Smoke Risk',
      message: `Hot, dry, and windy conditions elevate brushfire hazards. Check local highway advisories.`,
      icon: '🔥',
    });
  }

  return alerts;
}

/**
 * Evaluates hourly forecast to recommend departure-time adjustments when conditions are severe.
 */
export function evaluateDepartureAdvice(
  hourlyTimes: string[],
  hourlyPrecipitation: number[],
  hourlyWindGusts: number[],
  targetDate: string
): string | undefined {
  if (!hourlyTimes || hourlyTimes.length === 0) return undefined;

  // Filter hours corresponding to targetDate between 06:00 and 18:00
  const dayIndices: number[] = [];
  for (let i = 0; i < hourlyTimes.length; i++) {
    if (hourlyTimes[i].startsWith(targetDate)) {
      const hour = parseInt(hourlyTimes[i].slice(11, 13), 10);
      if (hour >= 6 && hour <= 18) {
        dayIndices.push(i);
      }
    }
  }

  if (dayIndices.length < 6) return undefined;

  // Compare morning (07:00-11:00) vs afternoon (12:00-16:00)
  const morningIndices = dayIndices.slice(1, 5); // ~7am to 10am
  const afternoonIndices = dayIndices.slice(6, 10); // ~12pm to 3pm

  const morningSevere = morningIndices.some(
    (idx) => (hourlyPrecipitation[idx] ?? 0) > 4 || (hourlyWindGusts[idx] ?? 0) > 60
  );
  const afternoonCalm = afternoonIndices.every(
    (idx) => (hourlyPrecipitation[idx] ?? 0) < 1.5 && (hourlyWindGusts[idx] ?? 0) < 45
  );

  if (morningSevere && afternoonCalm) {
    return '⚠️ Morning storm warning: Recommend delaying departure from 08:30 to ~11:30 for significantly clearer road conditions.';
  }

  const afternoonSevere = afternoonIndices.some(
    (idx) => (hourlyPrecipitation[idx] ?? 0) > 5 || (hourlyWindGusts[idx] ?? 0) > 65
  );
  const morningCalm = morningIndices.every(
    (idx) => (hourlyPrecipitation[idx] ?? 0) < 1.0 && (hourlyWindGusts[idx] ?? 0) < 40
  );

  if (afternoonSevere && morningCalm) {
    return '⚠️ Afternoon squall / severe thunderstorm: Recommend departing earlier (07:30) to complete highway driving before the front arrives.';
  }

  return undefined;
}

/**
 * Fetches accurate multi-day and safety weather forecast using the Open-Meteo API.
 * Free, worldwide, requires 0 API keys.
 */
export async function fetchWeather(
  lat: number,
  lng: number,
  startDate: string, // YYYY-MM-DD
  days = 1
): Promise<DayWeather[]> {
  try {
    const start = new Date(startDate);
    const end = new Date(start);
    end.setDate(end.getDate() + Math.max(1, days) - 1);

    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];

    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', lat.toFixed(4));
    url.searchParams.set('longitude', lng.toFixed(4));
    url.searchParams.set(
      'daily',
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,snowfall_sum'
    );
    url.searchParams.set(
      'hourly',
      'precipitation,wind_gusts_10m'
    );
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('start_date', startStr);
    url.searchParams.set('end_date', endStr);

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      console.warn('Open-Meteo request failed:', res.status);
      return [];
    }

    const data = await res.json();
    const daily = data.daily;
    if (!daily || !daily.time || !Array.isArray(daily.time)) return [];

    const results: DayWeather[] = [];
    const hourlyTimes: string[] = data.hourly?.time || [];
    const hourlyPrecip: number[] = data.hourly?.precipitation || [];
    const hourlyGusts: number[] = data.hourly?.wind_gusts_10m || [];

    for (let i = 0; i < daily.time.length; i++) {
      const dateStr = daily.time[i];
      const tempMax = Math.round(daily.temperature_2m_max?.[i] ?? 20);
      const tempMin = Math.round(daily.temperature_2m_min?.[i] ?? 12);
      const precip = Math.round((daily.precipitation_sum?.[i] ?? 0) * 10) / 10;
      const wind = Math.round(daily.wind_speed_10m_max?.[i] ?? 15);
      const gusts = Math.round(daily.wind_gusts_10m_max?.[i] ?? (wind * 1.3));
      const snow = Math.round((daily.snowfall_sum?.[i] ?? 0) * 10) / 10;
      const code = daily.weather_code?.[i] ?? 0;

      const alerts = evaluateWeatherAlerts(tempMax, tempMin, precip, wind, gusts, snow, code);
      const departureAdvice = evaluateDepartureAdvice(hourlyTimes, hourlyPrecip, hourlyGusts, dateStr);

      results.push({
        date: dateStr,
        tempMaxC: tempMax,
        tempMinC: tempMin,
        precipitationMm: precip,
        windspeedKmh: wind,
        windGustsKmh: gusts,
        snowfallCm: snow,
        weatherCode: code,
        alerts,
        departureAdvice,
      });
    }

    return results;
  } catch (err) {
    console.warn('Open-Meteo API query error:', err);
    return [];
  }
}
