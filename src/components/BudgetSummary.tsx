'use client';

import { useState } from 'react';
import { TripPlan, DayPlan } from '@/lib/types';

interface BudgetSummaryProps {
  tripPlan: TripPlan;
  fuelPricePerLiter?: number;
}

interface DayBudget {
  dayNumber: number;
  date: string;
  fuelCost: number;
  hotelCostRange: [number, number]; // [min, max] in €
  attractionCostRange: [number, number];
  restaurantCostRange: [number, number];
  totalMin: number;
  totalMax: number;
}

/**
 * Convert priceLevel (0–4) to a per-person cost range in €
 * 0=free, 1=cheap, 2=moderate, 3=expensive, 4=very expensive
 */
function priceLevelToRange(
  priceLevel: number | undefined,
  type: 'hotel' | 'attraction' | 'restaurant'
): [number, number] {
  if (priceLevel == null) {
    // Unknown: use midrange estimates
    if (type === 'hotel') return [60, 120];
    if (type === 'restaurant') return [15, 30];
    return [0, 15];
  }
  if (type === 'hotel') {
    const ranges: [number, number][] = [[30, 60], [60, 100], [100, 180], [180, 350], [350, 600]];
    return ranges[Math.min(priceLevel, 4)];
  }
  if (type === 'restaurant') {
    const ranges: [number, number][] = [[5, 10], [10, 20], [20, 40], [40, 80], [80, 150]];
    return ranges[Math.min(priceLevel, 4)];
  }
  // attraction
  const ranges: [number, number][] = [[0, 0], [0, 10], [10, 25], [25, 60], [60, 150]];
  return ranges[Math.min(priceLevel, 4)];
}

function computeDayBudget(day: DayPlan): DayBudget {
  const fuelCost = day.estimatedFuelCost ?? 0;

  // Best hotel suggestion
  const bestHotel = day.hotelSuggestions[0];
  const hotelRange = day.isRestDay
    ? [0, 0] as [number, number]
    : priceLevelToRange(bestHotel?.priceLevel, 'hotel');

  // One restaurant per day
  const bestRestaurant = day.restaurants[0];
  const restaurantRange = priceLevelToRange(bestRestaurant?.priceLevel, 'restaurant');

  // Up to 2 attractions
  const attractionCost = day.attractions.slice(0, 2).reduce<[number, number]>(
    (acc, a) => {
      const r = priceLevelToRange(a.priceLevel, 'attraction');
      return [acc[0] + r[0], acc[1] + r[1]];
    },
    [0, 0]
  );

  const totalMin = Math.round(fuelCost + hotelRange[0] + restaurantRange[0] + attractionCost[0]);
  const totalMax = Math.round(fuelCost + hotelRange[1] + restaurantRange[1] + attractionCost[1]);

  return {
    dayNumber: day.dayNumber,
    date: day.date,
    fuelCost: Math.round(fuelCost),
    hotelCostRange: hotelRange,
    attractionCostRange: attractionCost,
    restaurantCostRange: restaurantRange,
    totalMin,
    totalMax,
  };
}

export default function BudgetSummary({ tripPlan }: BudgetSummaryProps) {
  const [expanded, setExpanded] = useState(false);

  const budgets = tripPlan.days.map(computeDayBudget);
  const grandMin = budgets.reduce((s, b) => s + b.totalMin, 0);
  const grandMax = budgets.reduce((s, b) => s + b.totalMax, 0);
  const totalFuel = budgets.reduce((s, b) => s + b.fuelCost, 0);
  const totalHotelMin = budgets.reduce((s, b) => s + b.hotelCostRange[0], 0);
  const totalHotelMax = budgets.reduce((s, b) => s + b.hotelCostRange[1], 0);

  return (
    <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between p-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">💰</span>
          <div>
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
              Estimated Budget
            </p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              €{grandMin.toLocaleString()} – €{grandMax.toLocaleString()} total per person
            </p>
          </div>
        </div>
        <span className="text-emerald-600 dark:text-emerald-400 text-sm">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="border-t border-emerald-200 dark:border-emerald-700 px-3 pb-3 space-y-3">
          {/* Totals breakdown */}
          <div className="grid grid-cols-3 gap-2 pt-3">
            <div className="text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400">⛽ Fuel</p>
              <p className="text-sm font-bold text-gray-800 dark:text-white">€{totalFuel}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400">🏨 Hotels</p>
              <p className="text-sm font-bold text-gray-800 dark:text-white">
                €{totalHotelMin}–{totalHotelMax}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400">🎟️ Activities</p>
              <p className="text-sm font-bold text-gray-800 dark:text-white">
                €{budgets.reduce((s, b) => s + b.attractionCostRange[0], 0)}–
                {budgets.reduce((s, b) => s + b.attractionCostRange[1], 0)}
              </p>
            </div>
          </div>

          <p className="text-xs text-gray-400 dark:text-gray-500 text-center italic">
            Estimates per person · Actual costs vary · Attractions include up to 2/day
          </p>

          {/* Per-day table */}
          <div className="space-y-1">
            {budgets.map((b) => (
              <div
                key={b.dayNumber}
                className="flex items-center justify-between text-xs text-gray-700 dark:text-gray-300 py-1 border-b border-emerald-100 dark:border-emerald-800 last:border-0"
              >
                <span className="font-medium w-12">Day {b.dayNumber}</span>
                <span className="text-gray-400 flex-1">
                  {b.fuelCost > 0 && `⛽€${b.fuelCost} `}
                  {b.hotelCostRange[1] > 0 && `🏨€${b.hotelCostRange[0]}–${b.hotelCostRange[1]} `}
                  {b.restaurantCostRange[1] > 0 && `🍽️€${b.restaurantCostRange[0]}–${b.restaurantCostRange[1]} `}
                </span>
                <span className="font-semibold text-emerald-700 dark:text-emerald-300 w-24 text-right">
                  €{b.totalMin}–{b.totalMax}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
