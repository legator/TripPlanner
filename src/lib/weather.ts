'use client';

export interface DayWeather {
  date: string;
  tempMaxC: number;
  tempMinC: number;
  precipitationMm: number;
  windspeedKmh: number;
  weatherCode: number; // WMO code
}

/** WMO weather interpretation codes → emoji + label */
export function describeWeather(code: number): { emoji: string; label: string } {
  if (code === 0) return { emoji: '☀️', label: 'Clear' };
  if (code <= 2) return { emoji: '🌤️', label: 'Partly cloudy' };
  if (code === 3) return { emoji: '☁️', label: 'Overcast' };
  if (code <= 49) return { emoji: '🌫️', label: 'Foggy' };
  if (code <= 57) return { emoji: '🌧️', label: 'Drizzle' };
  if (code <= 67) return { emoji: '🌧️', label: 'Rain' };
  if (code <= 77) return { emoji: '❄️', label: 'Snow' };
  if (code <= 82) return { emoji: '🌦️', label: 'Showers' };
  if (code <= 86) return { emoji: '🌨️', label: 'Snow showers' };
  if (code <= 99) return { emoji: '⛈️', label: 'Thunderstorm' };
  return { emoji: '🌡️', label: 'Unknown' };
}

/**
 * Fetches a daily weather forecast for a single location using Open-Meteo.
 * No API key required. Data available up to 16 days ahead.
 */
export async function fetchWeather(
  lat: number,
  lng: number,
  startDate: string, // YYYY-MM-DD
  days = 1
): Promise<DayWeather[]> {
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + days - 1);
  const endStr = endDate.toISOString().split('T')[0];

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lng));
  url.searchParams.set('daily', 'weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max');
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('start_date', startDate);
  url.searchParams.set('end_date', endStr);

  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const data = await res.json();
  const d = data.daily;
  if (!d?.time) return [];

  return (d.time as string[]).map((date: string, i: number) => ({
    date,
    tempMaxC: Math.round(d.temperature_2m_max[i] ?? 0),
    tempMinC: Math.round(d.temperature_2m_min[i] ?? 0),
    precipitationMm: Math.round((d.precipitation_sum[i] ?? 0) * 10) / 10,
    windspeedKmh: Math.round(d.windspeed_10m_max[i] ?? 0),
    weatherCode: d.weathercode[i] ?? 0,
  }));
}
