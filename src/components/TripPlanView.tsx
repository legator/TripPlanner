'use client';

import { TripPlan, Waypoint } from '@/lib/types';
import DayCard from './DayCard';
import BudgetSummary from './BudgetSummary';

interface TripPlanViewProps {
  tripPlan: TripPlan;
  selectedDay: number | null;
  onSelectDay: (day: number | null) => void;
  onReset: () => void;
  onToggleRestDay: (dayIndex: number) => void;
  onSetDayEnd: (dayIndex: number, segmentCount: number) => void;
  onAddOvernightStop: (dayIndex: number, waypoint: Waypoint) => void;
  onOptimizeRoute?: (dayIndex: number) => void;
  isPlanning: boolean;
  maxDistanceKm: number;
  maxDrivingMinutes: number;
}

export default function TripPlanView({
  tripPlan,
  selectedDay,
  onSelectDay,
  onReset,
  onToggleRestDay,
  onSetDayEnd,
  onAddOvernightStop,
  onOptimizeRoute,
  isPlanning,
  maxDistanceKm,
  maxDrivingMinutes,
}: TripPlanViewProps) {
  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const restDays = tripPlan.days.filter((d) => d.isRestDay).length;
  const drivingDays = tripPlan.totalDays - restDays;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-800 dark:text-white">Your Trip Plan</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {tripPlan.totalDays} day{tripPlan.totalDays !== 1 ? 's' : ''}
            {restDays > 0 && ` (${restDays} rest)`} •{' '}
            {tripPlan.totalDistanceKm.toLocaleString()} km •{' '}
            {formatDuration(tripPlan.totalDurationMinutes)} driving
          </p>
        </div>
        <button
          onClick={onReset}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
        >
          ← Edit trip
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2.5 text-center">
          <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{drivingDays}+{restDays}</p>
          <p className="text-xs text-blue-500 dark:text-blue-400">Drive + Rest</p>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-2.5 text-center">
          <p className="text-lg font-bold text-green-700 dark:text-green-300">
            {tripPlan.totalDistanceKm.toLocaleString()}
          </p>
          <p className="text-xs text-green-500 dark:text-green-400">Total km</p>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-2.5 text-center">
          <p className="text-lg font-bold text-purple-700 dark:text-purple-300">
            {formatDuration(tripPlan.totalDurationMinutes)}
          </p>
          <p className="text-xs text-purple-500 dark:text-purple-400">Driving</p>
        </div>
        {tripPlan.estimatedTotalFuelCost != null && tripPlan.estimatedTotalFuelCost > 0 && (
          <div className="col-span-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2.5 text-center">
            <p className="text-lg font-bold text-amber-700 dark:text-amber-300">
              ~{tripPlan.estimatedTotalFuelCost.toFixed(0)} {typeof window !== 'undefined' && Intl.NumberFormat().resolvedOptions().currency ? '' : ''}€
            </p>
            <p className="text-xs text-amber-500 dark:text-amber-400">Estimated fuel cost</p>
          </div>
        )}
      </div>

      {/* Budget summary */}
      <BudgetSummary tripPlan={tripPlan} />

      {/* Day filter */}
      {tripPlan.days.length > 1 && (
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => onSelectDay(null)}
            className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
              selectedDay === null
                ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-800'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            All days
          </button>
          {tripPlan.days.map((day, index) => (
            <button
              key={index}
              onClick={() => onSelectDay(selectedDay === index ? null : index)}
              className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                selectedDay === index
                  ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-800'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Day {day.dayNumber}
            </button>
          ))}
        </div>
      )}

      {/* Day cards */}
      <div className="space-y-3">
        {tripPlan.days
          .filter((_, i) => selectedDay === null || selectedDay === i)
          .map((day) => (
            <DayCard
              key={day.dayNumber}
              day={day}
              dayIndex={day.dayNumber - 1}
              isSelected={selectedDay === day.dayNumber - 1}
              onSelect={onSelectDay}
              onToggleRestDay={onToggleRestDay}
              onSetDayEnd={onSetDayEnd}
              onAddOvernightStop={onAddOvernightStop}
              onOptimizeRoute={onOptimizeRoute}
              isPlanning={isPlanning}
              maxDistanceKm={maxDistanceKm}
              maxDrivingMinutes={maxDrivingMinutes}
              allDays={tripPlan.days}
            />
          ))}
      </div>
    </div>
  );
}
