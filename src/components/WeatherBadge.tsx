'use client';

import { useEffect, useState } from 'react';
import { fetchWeather, DayWeather, describeWeather } from '@/lib/weather';

interface WeatherBadgeProps {
  lat: number;
  lng: number;
  date: string; // YYYY-MM-DD
  compact?: boolean;
  onWeatherLoaded?: (weather: DayWeather) => void;
}

export default function WeatherBadge({
  lat,
  lng,
  date,
  compact = false,
  onWeatherLoaded,
}: WeatherBadgeProps) {
  const [weather, setWeather] = useState<DayWeather | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchWeather(lat, lng, date, 1)
      .then((results) => {
        if (!cancelled && results[0]) {
          setWeather(results[0]);
          onWeatherLoaded?.(results[0]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lng, date, onWeatherLoaded]);

  if (loading) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-400 animate-pulse">
        <span className="w-3.5 h-3.5 bg-gray-200 dark:bg-gray-700 rounded-full" />
        <span className="w-10 h-2.5 bg-gray-200 dark:bg-gray-700 rounded" />
      </span>
    );
  }

  if (!weather) return null;

  const { emoji, label } = describeWeather(weather.weatherCode);
  const criticalAlert = weather.alerts?.find((a) => a.severity === 'critical') || weather.alerts?.[0];

  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      <span
        className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-full px-2 py-0.5"
        title={`${label} · ${weather.tempMinC}°–${weather.tempMaxC}°C · Precip: ${weather.precipitationMm}mm · Wind: ${weather.windspeedKmh} km/h (gusts ${weather.windGustsKmh} km/h)`}
      >
        <span>{emoji}</span>
        <span className="font-semibold">{weather.tempMaxC}°</span>
        <span className="text-gray-400 text-[11px]">/{weather.tempMinC}°C</span>
        {weather.precipitationMm > 0.5 && (
          <span className="text-blue-500 font-medium">💧{weather.precipitationMm}mm</span>
        )}
        {weather.snowfallCm > 0.5 && (
          <span className="text-sky-500 font-medium">❄️{weather.snowfallCm}cm</span>
        )}
      </span>

      {!compact && criticalAlert && (
        <span
          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
            criticalAlert.severity === 'critical'
              ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
              : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
          }`}
          title={criticalAlert.message}
        >
          <span>{criticalAlert.icon}</span>
          <span>{criticalAlert.title}</span>
        </span>
      )}
    </div>
  );
}
