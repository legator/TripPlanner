'use client';

import { useEffect, useState } from 'react';
import { fetchWeather, DayWeather, describeWeather } from '@/lib/weather';

interface WeatherBadgeProps {
  lat: number;
  lng: number;
  date: string; // YYYY-MM-DD
}

export default function WeatherBadge({ lat, lng, date }: WeatherBadgeProps) {
  const [weather, setWeather] = useState<DayWeather | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchWeather(lat, lng, date, 1)
      .then((results) => {
        if (!cancelled) setWeather(results[0] ?? null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [lat, lng, date]);

  if (loading) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-400 animate-pulse">
        <span className="w-4 h-4 bg-gray-200 rounded" />
        <span className="w-12 h-3 bg-gray-200 rounded" />
      </span>
    );
  }

  if (!weather) return null;

  const { emoji, label } = describeWeather(weather.weatherCode);

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded-full px-2 py-0.5"
      title={`${label} · ${weather.tempMinC}°–${weather.tempMaxC}°C · ${weather.precipitationMm}mm rain · wind ${weather.windspeedKmh} km/h`}
    >
      <span>{emoji}</span>
      <span className="font-medium">{weather.tempMaxC}°</span>
      <span className="text-gray-400">/ {weather.tempMinC}°C</span>
      {weather.precipitationMm > 0.5 && (
        <span className="text-blue-500">💧{weather.precipitationMm}mm</span>
      )}
    </span>
  );
}
