'use client';

import { useState } from 'react';
import { DayPlan, DaySegment, Waypoint } from '@/lib/types';
import { DAY_COLORS } from '@/lib/constants';
import PlaceCard from './PlaceCard';
import PlaceAutocomplete from './PlaceAutocomplete';

interface DayCardProps {
  day: DayPlan;
  dayIndex: number;
  allDays: DayPlan[];
  isSelected: boolean;
  onSelect: (index: number | null) => void;
  onToggleRestDay: (dayIndex: number) => void;
  onSetDayEnd: (dayIndex: number, segmentCount: number) => void;
  onAddOvernightStop: (dayIndex: number, waypoint: Waypoint) => void;
  onOptimizeRoute?: (dayIndex: number) => void;
  isPlanning: boolean;
  maxDistanceKm: number;
  maxDrivingMinutes: number;
}

export default function DayCard({
  day,
  dayIndex,
  allDays,
  isSelected,
  onSelect,
  onToggleRestDay,
  onSetDayEnd,
  onAddOvernightStop,
  onOptimizeRoute,
  isPlanning,
  maxDistanceKm,
  maxDrivingMinutes,
}: DayCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showEndStopPicker, setShowEndStopPicker] = useState(false);
  const color = day.isRestDay ? '#6b7280' : DAY_COLORS[dayIndex % DAY_COLORS.length];

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  // Build the pool — same logic as setDayEndAtSegment in tripPlanEditor.ts
  const nextDrivingDay = allDays.slice(dayIndex + 1).find((d) => !d.isRestDay && d.segments.length > 0);
  const nextDaySegments = nextDrivingDay?.segments ?? [];
  const allSegments = [...day.segments, ...nextDaySegments];
  const currentSegmentCount = day.segments.length;

  // Check if this day exceeds configured limits
  const overDistance = !day.isRestDay && day.distanceKm > maxDistanceKm;
  const overTime = !day.isRestDay && day.durationMinutes > maxDrivingMinutes;
  const overLimit = overDistance || overTime;

  return (
    <div
      className={`day-card rounded-xl border-2 slide-in ${
        isSelected ? 'border-primary-400 shadow-md' : 'border-gray-100'
      }`}
      style={{ animationDelay: `${dayIndex * 80}ms`, borderLeftColor: color, borderLeftWidth: '4px' }}
    >
      {/* Header */}
      <button
        onClick={() => onSelect(isSelected ? null : dayIndex)}
        className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors text-left"
      >
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
          style={{ backgroundColor: color }}
        >
          {day.isRestDay ? '🌿' : `D${day.dayNumber}`}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-800">
              {day.isRestDay ? `Day ${day.dayNumber} — Rest Day` : `Day ${day.dayNumber}`}
            </span>
            <span className="text-xs text-gray-400">{formatDate(day.date)}</span>
          </div>
          {day.isRestDay ? (
            <p className="text-xs text-gray-500 truncate mt-0.5">
              Relax in {day.startLocation.name.split(',')[0]}
            </p>
          ) : (
            <p className="text-xs text-gray-500 truncate mt-0.5">
              {day.startLocation.name.split(',')[0]} → {day.endLocation.name.split(',')[0]}
            </p>
          )}
        </div>
        {!day.isRestDay && (
          <div className="flex-shrink-0 text-right">
            <p className={`text-sm font-semibold ${overDistance ? 'text-amber-600' : 'text-gray-700'}`}>
              {day.distanceKm} km
              {overDistance && <span className="ml-0.5" title={`Exceeds ${maxDistanceKm} km limit`}>⚠️</span>}
            </p>
            <p className={`text-xs ${overTime ? 'text-amber-600' : 'text-gray-400'}`}>
              {formatDuration(day.durationMinutes)}
              {overTime && <span className="ml-0.5" title={`Exceeds ${formatDuration(maxDrivingMinutes)} limit`}>⚠️</span>}
            </p>
          </div>
        )}
      </button>

      {/* Over-limit warning */}
      {overLimit && (
        <div className="mx-3 mb-2 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700 flex items-center gap-1.5">
          <span>⚠️</span>
          <span>
            This day exceeds your{overDistance ? ` ${maxDistanceKm} km` : ''}
            {overDistance && overTime ? ' and' : ''}
            {overTime ? ` ${formatDuration(maxDrivingMinutes)}` : ''} limit
            — still allowed
          </span>
        </div>
      )}

      {/* Summary stats */}
      <div className="flex items-center gap-3 px-3 pb-2 text-xs text-gray-500 flex-wrap">
        {day.schedule.length > 0 && (
          <span className="flex items-center gap-1">
            🗓️ {day.schedule[0].time}–{day.schedule[day.schedule.length - 1].time}
          </span>
        )}
        {day.gasStops.length > 0 && (
          <span className="flex items-center gap-1">⛽ {day.gasStops.length}</span>
        )}
        {day.hotelSuggestions.length > 0 && (
          <span className="flex items-center gap-1">🏨 {day.hotelSuggestions.length}</span>
        )}
        {day.attractions.length > 0 && (
          <span className="flex items-center gap-1">⭐ {day.attractions.length}</span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          className="ml-auto text-primary-500 hover:text-primary-700 font-medium"
        >
          {expanded ? 'Less' : 'Details'}
        </button>
      </div>

      {/* ── Edit toolbar ── */}
      <div className="flex items-center gap-1.5 px-3 pb-2 flex-wrap">
        {day.isRestDay ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleRestDay(dayIndex); }}
            className="px-2 py-0.5 text-xs rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
            disabled={isPlanning}
          >
            ✕ Remove rest day
          </button>
        ) : (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onToggleRestDay(dayIndex); }}
              className="px-2 py-0.5 text-xs rounded-full bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
              disabled={isPlanning}
            >
              🌿 + Rest day
            </button>
            {day.segments.length > 1 && onOptimizeRoute && (
              <button
                onClick={(e) => { e.stopPropagation(); onOptimizeRoute(dayIndex); }}
                className="px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                disabled={isPlanning}
                title="Optimize waypoint order for efficiency"
              >
                🔄 Optimize route
              </button>
            )}
            {day.segments.length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowEndStopPicker(!showEndStopPicker); }}
                className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                  showEndStopPicker
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                }`}
                disabled={isPlanning}
              >
                🏨 Change overnight
              </button>
            )}
          </>
        )}
      </div>

      {/* ── Overnight stop picker ── */}
      {showEndStopPicker && !day.isRestDay && (
        <div className="px-3 pb-3 space-y-2" onClick={(e) => e.stopPropagation()}>
          {/* Debug info */}
          <p className="text-[10px] text-gray-300">
            Pool: {day.segments.length} seg(s) this day
            {nextDrivingDay ? ` + ${nextDaySegments.length} from Day ${nextDrivingDay.dayNumber}` : ' (no next driving day)'}
            {' • dayIndex='}{dayIndex}
          </p>
          {/* Dropdown: pick from existing route stops */}
          <div>
            <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">
              Stop at (along current route)
            </label>
            <select
              value={currentSegmentCount}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (val !== currentSegmentCount) {
                  onSetDayEnd(dayIndex, val);
                  setShowEndStopPicker(false);
                }
              }}
              className="w-full px-2.5 py-2 text-sm border border-gray-200 rounded-lg bg-white
                         focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 outline-none
                         cursor-pointer"
            >
              {allSegments.map((seg, i) => {
                const segIdx = i + 1;
                const isCurrent = segIdx === currentSegmentCount;
                const cumKm = allSegments.slice(0, segIdx).reduce((s, sg) => s + sg.distanceKm, 0);
                const cumMin = allSegments.slice(0, segIdx).reduce((s, sg) => s + sg.durationMinutes, 0);
                const exceedsKm = cumKm > maxDistanceKm;
                const exceedsMin = cumMin > maxDrivingMinutes;
                const isFromNextDay = i >= currentSegmentCount;
                const isLastOfNextDay = isFromNextDay && segIdx === allSegments.length;
                return (
                  <option key={i} value={segIdx}>
                    {seg.endName.split(',')[0]} — {cumKm} km, {formatDuration(cumMin)}
                    {isCurrent ? ' ✓ current' : ''}
                    {isLastOfNextDay ? ` (removes Day ${nextDrivingDay!.dayNumber})` : ''}
                    {exceedsKm || exceedsMin ? ' ⚠ over limit' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-2 text-[10px] text-gray-300">
            <div className="flex-1 h-px bg-gray-200" />
            <span>or add a new stop</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Search: add a completely new stop */}
          <div>
            <PlaceAutocomplete
              placeholder="Search city, hotel, place..."
              disabled={isPlanning}
              onPlaceSelect={(waypoint) => {
                setShowEndStopPicker(false);
                onAddOvernightStop(dayIndex, waypoint);
              }}
            />
            <p className="text-[10px] text-gray-400 mt-1">
              Adds a new stop & re-plans the route (won't change your main stops)
            </p>
          </div>

          {isPlanning && (
            <p className="text-xs text-indigo-500 animate-pulse">Re-planning trip...</p>
          )}
        </div>
      )}

      {/* ── Expanded details ── */}
      {expanded && (
        <div className="border-t border-gray-100 p-3 space-y-4 bg-gray-50/50">
          {/* Schedule timeline */}
          {day.schedule.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
                Day Schedule
              </h4>
              <div className="relative pl-6 space-y-0">
                <div className="absolute left-2.5 top-1 bottom-1 w-px bg-gray-200" />
                {day.schedule.map((event, i) => (
                  <div key={i} className="relative flex items-start gap-2 py-1.5">
                    <div
                      className="absolute -left-[14px] top-2 w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm"
                      style={{ backgroundColor: event.type === 'drive' ? color : '#9ca3af' }}
                    />
                    <span className="text-xs font-mono text-gray-400 w-12 flex-shrink-0">
                      {event.time}
                    </span>
                    <span className="text-sm flex-shrink-0">{event.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700">{event.title}</p>
                      {event.endTime && (
                        <p className="text-[10px] text-gray-400">
                          until {event.endTime}
                          {event.durationMinutes > 0 && ` · ${formatDuration(event.durationMinutes)}`}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Gas stations */}
          {day.gasStops.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                Gas Stations
              </h4>
              <div className="space-y-0.5">
                {day.gasStops.map((gas) => (
                  <PlaceCard key={gas.id} place={gas} icon="⛽" compact />
                ))}
              </div>
            </div>
          )}

          {/* Hotels */}
          {day.hotelSuggestions.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                Where to Stay
              </h4>
              <div className="space-y-1.5">
                {day.hotelSuggestions.slice(0, 3).map((hotel) => (
                  <PlaceCard key={hotel.id} place={hotel} icon="🏨" />
                ))}
              </div>
            </div>
          )}

          {/* Attractions */}
          {day.attractions.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                Nearby Attractions
              </h4>
              <div className="space-y-1.5">
                {day.attractions.slice(0, 4).map((attr) => (
                  <PlaceCard key={attr.id} place={attr} icon="⭐" />
                ))}
              </div>
            </div>
          )}

          {/* Restaurants */}
          {day.restaurants.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                Places to Eat
              </h4>
              <div className="space-y-0.5">
                {day.restaurants.slice(0, 3).map((rest) => (
                  <PlaceCard key={rest.id} place={rest} icon="🍽️" compact />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
