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
 * Fetches a daily weather forecast using HERE Destination Weather API.
 * Data available up to 7 days ahead.
 */
export async function fetchWeather(
  lat: number,
  lng: number,
  startDate: string, // YYYY-MM-DD
  days = 1
): Promise<DayWeather[]> {
  const API_KEY = process.env.NEXT_PUBLIC_HERE_API_KEY || process.env.HERE_API_KEY || '';
  if (!API_KEY) return [];

  const url = new URL('https://weather.hereapi.com/v3/report');
  url.searchParams.set('apiKey', API_KEY);
  url.searchParams.set('products', 'forecast7daysSimple');
  url.searchParams.set('location', `${lat},${lng}`);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error('Weather fetch error:', res.status, await res.text());
      return [];
    }
    const data = await res.json();
    
    const forecasts = data.places?.[0]?.dailyForecasts?.[0]?.forecasts;
    if (!forecasts) return [];

    // Filter forecasts by requested date range
    const start = new Date(startDate);
    const end = new Date(start);
    end.setDate(end.getDate() + days - 1);

    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];

    const results: DayWeather[] = [];
    for (const f of forecasts) {
      const fDate = new Date(f.time).toISOString().split('T')[0];
      if (fDate >= startStr && fDate <= endStr) {
        // Map HERE weather icon ID to WMO roughly
        // 1-2: sunny, 3-4: partly cloudy, 5-6: cloudy, 7-14: rain, 15-18: snow
        let code = 0;
        const icon = f.iconId || 0;
        if (icon >= 3 && icon <= 4) code = 2; // partly cloudy
        else if (icon >= 5 && icon <= 6) code = 3; // overcast
        else if (icon >= 7 && icon <= 14) code = 61; // rain
        else if (icon >= 15 && icon <= 18) code = 71; // snow
        else if (icon >= 19 && icon <= 22) code = 95; // thunderstorm
        else if (icon >= 23 && icon <= 28) code = 45; // fog / misc
        else if (icon >= 29 && icon <= 34) code = 82; // showers
        
        results.push({
          date: fDate,
          tempMaxC: Math.round(Number(f.highTemperature || 0)),
          tempMinC: Math.round(Number(f.lowTemperature || 0)),
          precipitationMm: Number(f.precipitationProbability ?? 0), // HERE simple doesn't always give mm, use prob
          windspeedKmh: Math.round(Number(f.windSpeed || 0)),
          weatherCode: code,
        });
      }
    }
    
    return results;
  } catch (err) {
    console.error('Weather fetch error:', err);
    return [];
  }
}
