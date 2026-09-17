'use client';

import { useState } from 'react';
import { DayPlan, Waypoint } from '@/lib/types';
import { DAY_COLORS } from '@/lib/constants';
import PlaceCard from './PlaceCard';
import PlaceSearch from './PlaceSearch';
import WeatherBadge from './WeatherBadge';
import { DayWeather } from '@/lib/weather';

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
  onStartDayFromLocation?: (dayIndex: number) => void;
  onStartDriving?: (dayIndex: number) => void;
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
  onStartDayFromLocation,
  onStartDriving,
  isPlanning,
  maxDistanceKm,
  maxDrivingMinutes,
}: DayCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showEndStopPicker, setShowEndStopPicker] = useState(false);
  const [dayWeather, setDayWeather] = useState<DayWeather | null>(null);
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
        isSelected ? 'border-primary-400 shadow-md' : 'border-gray-100 dark:border-gray-700'
      }`}
      style={{ animationDelay: `${dayIndex * 80}ms`, borderLeftColor: color, borderLeftWidth: '4px' }}
    >
      {/* Header */}
      <button
        onClick={() => onSelect(isSelected ? null : dayIndex)}
        className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
      >
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
          style={{ backgroundColor: color }}
        >
          {day.isRestDay ? '🌿' : `D${day.dayNumber}`}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-800 dark:text-white">
              {day.isRestDay ? `Day ${day.dayNumber} — Rest Day` : `Day ${day.dayNumber}`}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">{formatDate(day.date)}</span>
          </div>
          {day.isRestDay ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
              Relax in {day.startLocation.name.split(',')[0]}
            </p>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
              {day.startLocation.name.split(',')[0]} → {day.endLocation.name.split(',')[0]}
            </p>
          )}
          <div className="mt-1">
            <WeatherBadge
              lat={day.endLocation.location.lat}
              lng={day.endLocation.location.lng}
              date={day.date}
              onWeatherLoaded={setDayWeather}
            />
          </div>
        </div>
        {!day.isRestDay && (
          <div className="flex-shrink-0 text-right">
            <p className={`text-sm font-semibold ${overDistance ? 'text-amber-600 dark:text-amber-400' : 'text-gray-700 dark:text-gray-300'}`}>
              {day.distanceKm} km
              {overDistance && <span className="ml-0.5" title={`Exceeds ${maxDistanceKm} km limit`}>⚠️</span>}
            </p>
            <p className={`text-xs ${overTime ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-gray-500'}`}>
              {formatDuration(day.durationMinutes)}
              {overTime && <span className="ml-0.5" title={`Exceeds ${formatDuration(maxDrivingMinutes)} limit`}>⚠️</span>}
            </p>
          </div>
        )}
      </button>

      {/* Over-limit warning */}
      {overLimit && (
        <div className="mx-3 mb-2 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
          <span>⚠️</span>
          <span>
            This day exceeds your{overDistance ? ` ${maxDistanceKm} km` : ''}
            {overDistance && overTime ? ' and' : ''}
            {overTime ? ` ${formatDuration(maxDrivingMinutes)}` : ''} limit
            — still allowed
          </span>
        </div>
      )}

      {/* Weather Safety Hazard & Departure Recommendation */}
      {dayWeather && (dayWeather.alerts.length > 0 || dayWeather.departureAdvice) && (
        <div className="mx-3 mb-2 space-y-1.5">
          {dayWeather.alerts.map((alert) => (
            <div
              key={alert.id}
              className={`px-3 py-2 rounded-lg text-xs flex items-start gap-2 border ${
                alert.severity === 'critical'
                  ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800/60'
                  : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800/60'
              }`}
            >
              <span className="text-base leading-none">{alert.icon}</span>
              <div className="flex-1 min-w-0">
                <span className="font-bold">{alert.title}: </span>
                <span>{alert.message}</span>
              </div>
            </div>
          ))}

          {dayWeather.departureAdvice && (
            <div className="px-3 py-2 rounded-lg text-xs bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800/60 flex items-start gap-2">
              <span className="text-base leading-none">⏱️</span>
              <div className="flex-1 min-w-0 font-medium">
                {dayWeather.departureAdvice}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Summary stats */}
      <div className="flex items-center gap-3 px-3 pb-2 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
        {day.schedule.length > 0 && (
          <span className="flex items-center gap-1">
            🗓️ {day.schedule[0].time}–{day.schedule[day.schedule.length - 1].time}
          </span>
        )}
        {day.gasStops.length > 0 && (
          <span className="flex items-center gap-1">⛽ {day.gasStops.length}</span>
        )}
        {(day.evStopsDetailed?.length ?? 0) > 0 && (
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
            ⚡ {day.evStopsDetailed?.length} charge {day.estimatedChargingCost ? `(€${day.estimatedChargingCost.toFixed(2)})` : ''}
          </span>
        )}
        {day.hotelSuggestions.length > 0 && (
          <span className="flex items-center gap-1">🏨 {day.hotelSuggestions.length}</span>
        )}
        {day.attractions.length > 0 && (
          <span className="flex items-center gap-1">⭐ {day.attractions.length}</span>
        )}
        {day.parkingStops && day.parkingStops.length > 0 && (
          <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
            🅿️ {day.parkingStops.length}
          </span>
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
            {onStartDayFromLocation && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onStartDayFromLocation(dayIndex);
                }}
                className="px-2 py-0.5 text-xs rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100 transition-colors flex items-center gap-1"
                disabled={isPlanning}
                title="Start this day from your current location"
              >
                <span>📍 Start from Here</span>
              </button>
            )}
            {onStartDriving && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onStartDriving(dayIndex);
                }}
                className="px-2.5 py-0.5 text-xs rounded-full bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors flex items-center gap-1 shadow-sm"
                disabled={isPlanning}
                title="Start live GPS driving follow mode for this day"
              >
                <span>🚗 Drive</span>
              </button>
            )}
          </>
        )}
      </div>

      {/* ── Overnight stop picker ── */}
      {showEndStopPicker && !day.isRestDay && (
        <div className="px-3 pb-3 space-y-2" onClick={(e) => e.stopPropagation()}>
          {/* Debug info */}
          <p className="text-[10px] text-gray-300 dark:text-gray-600">
            Pool: {day.segments.length} seg(s) this day
            {nextDrivingDay ? ` + ${nextDaySegments.length} from Day ${nextDrivingDay.dayNumber}` : ' (no next driving day)'}
            {' • dayIndex='}{dayIndex}
          </p>
          {/* Dropdown: pick from existing route stops */}
          <div>
            <label className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide block mb-1">
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
              className="w-full px-2.5 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-200
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
          <div className="flex items-center gap-2 text-[10px] text-gray-300 dark:text-gray-600">
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-600" />
            <span>or add a new stop</span>
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-600" />
          </div>

          {/* Search: add a completely new stop */}
          <div>
            <PlaceSearch
              placeholder="Search city, hotel, place..."
              disabled={isPlanning}
              onPlaceSelect={(waypoint) => {
                setShowEndStopPicker(false);
                onAddOvernightStop(dayIndex, waypoint);
              }}
            />
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
              Adds a new stop &amp; re-plans the route (won&apos;t change your main stops)
            </p>
          </div>

          {isPlanning && (
            <p className="text-xs text-indigo-500 animate-pulse">Re-planning trip...</p>
          )}
        </div>
      )}

      {/* ── Expanded details ── */}
      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-700 p-3 space-y-4 bg-gray-50/50 dark:bg-gray-800/50">
          {/* Schedule timeline */}
          {day.schedule.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">
                Day Schedule
              </h4>
              <div className="relative pl-6 space-y-0">
                <div className="absolute left-2.5 top-1 bottom-1 w-px bg-gray-200 dark:bg-gray-600" />
                {day.schedule.map((event, i) => (
                  <div key={i} className="relative flex items-start gap-2 py-1.5">
                    <div
                      className="absolute -left-[14px] top-2 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-gray-800 shadow-sm"
                      style={{ backgroundColor: event.type === 'drive' ? color : '#9ca3af' }}
                    />
                    <span className="text-xs font-mono text-gray-400 dark:text-gray-500 w-12 flex-shrink-0">
                      {event.time}
                    </span>
                    <span className="text-sm flex-shrink-0">{event.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700 dark:text-gray-300">{event.title}</p>
                      {event.endTime && (
                        <p className="text-[10px] text-gray-400 dark:text-gray-500">
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
              <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                Gas Stations
              </h4>
              <div className="space-y-0.5">
                {day.gasStops.map((gas) => (
                  <PlaceCard key={gas.id} place={gas} icon="⛽" compact />
                ))}
              </div>
            </div>
          )}

          {/* EV Charging */}
          {((day.evStopsDetailed && day.evStopsDetailed.length > 0) || (day.evChargingStops && day.evChargingStops.length > 0)) && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <h4 className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide flex items-center gap-1.5">
                  <span>⚡</span> EV Fast Charging
                </h4>
                {day.estimatedChargingCost && day.estimatedChargingCost > 0 ? (
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                    Est. €{day.estimatedChargingCost.toFixed(2)}
                  </span>
                ) : null}
              </div>

              {day.evStopsDetailed && day.evStopsDetailed.length > 0 ? (
                <div className="space-y-2">
                  {day.evStopsDetailed.map((evStop, idx) => (
                    <div
                      key={evStop.place.id || `ev-stop-${idx}`}
                      className="p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-gray-900 dark:text-white">
                            {evStop.place.name}
                          </p>
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                            {evStop.place.address || evStop.place.vicinity}
                          </p>
                        </div>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          evStop.isAvailable !== false
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200'
                        }`}>
                          {evStop.isAvailable !== false ? '● Available' : '● Busy'}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] bg-white dark:bg-gray-800/80 p-1.5 rounded border border-emerald-100 dark:border-emerald-900/40">
                        <div>
                          <p className="text-gray-400 font-medium">Battery</p>
                          <p className="font-bold text-emerald-600 dark:text-emerald-400">
                            {evStop.arrivalBatteryPercent}% ➔ {evStop.departureBatteryPercent}%
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-400 font-medium">Duration</p>
                          <p className="font-bold text-gray-800 dark:text-gray-200">
                            ~{evStop.chargingMinutes} min
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-400 font-medium">Energy / Cost</p>
                          <p className="font-bold text-gray-800 dark:text-gray-200">
                            +{evStop.energyNeededKWh} kWh {evStop.chargingCost ? `(€${evStop.chargingCost})` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400 pt-0.5">
                        <span className="font-medium">
                          ⚡ {evStop.chargerPowerKW ? `${evStop.chargerPowerKW} kW` : '150 kW'} • {evStop.connectorType || 'CCS2'}
                        </span>
                        {evStop.place.evDetails?.availableStalls !== undefined && (
                          <span>
                            {evStop.place.evDetails.availableStalls}/{evStop.place.evDetails.totalStalls} stalls free
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-0.5">
                  {day.evChargingStops.map((ev) => (
                    <PlaceCard key={ev.id} place={ev} icon="⚡" compact />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Hotels */}
          {day.hotelSuggestions.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                Where to Stay
              </h4>
              <div className="space-y-1.5">
                {day.hotelSuggestions.slice(0, 3).map((hotel) => (
                  <PlaceCard key={hotel.id} place={hotel} icon="🏨" />
                ))}
              </div>
            </div>
          )}

          {/* Campgrounds */}
          {day.campgrounds?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                Campgrounds
              </h4>
              <div className="space-y-1.5">
                {day.campgrounds.slice(0, 3).map((camp) => (
                  <PlaceCard key={camp.id} place={camp} icon="🏕️" />
                ))}
              </div>
            </div>
          )}

          {/* Attractions & Per-Attraction Weather */}
          {day.attractions.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                Nearby Attractions & Forecast
              </h4>
              <div className="space-y-2">
                {day.attractions.slice(0, 4).map((attr) => (
                  <div key={attr.id} className="space-y-1">
                    <PlaceCard place={attr} icon="⭐" />
                    <div className="pl-2">
                      <WeatherBadge
                        lat={attr.location.lat}
                        lng={attr.location.lng}
                        date={day.date}
                        compact
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Restaurants */}
          {day.restaurants.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                Places to Eat
              </h4>
              <div className="space-y-0.5">
                {day.restaurants.slice(0, 3).map((rest) => (
                  <PlaceCard key={rest.id} place={rest} icon="🍽️" compact />
                ))}
              </div>
            </div>
          )}

          {/* Highway & Toll Rest Stops / Parking */}
          {day.parkingStops && day.parkingStops.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <h4 className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide flex items-center gap-1.5">
                  <span>🅿️</span> Highway Rest Stops & Parking
                </h4>
                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                  {day.parkingStops.length} along route
                </span>
              </div>
              <div className="space-y-1.5">
                {day.parkingStops.map((parking) => (
                  <div
                    key={parking.id}
                    className="p-2.5 rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/30 dark:bg-blue-950/20 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-gray-900 dark:text-white truncate">
                          {parking.name}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 font-medium">
                          {parking.parkingDetails?.isHighwayRestStop ? '🛑 Rest Area' : '🅿️ Parking'}
                        </span>
                        {parking.isOpen !== undefined && (
                          <span
                            className={`text-[9px] px-1 rounded ${
                              parking.isOpen
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                                : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                            }`}
                          >
                            {parking.isOpen ? 'Open' : 'Closed'}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
                        {parking.address || parking.vicinity}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onAddOvernightStop(dayIndex, {
                          id: parking.id,
                          name: `🅿️ ${parking.name}`,
                          address: parking.address || parking.vicinity || 'Parking',
                          location: parking.location,
                        })
                      }
                      className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-[11px] font-semibold transition-all flex-shrink-0"
                      title="Add this parking / rest area as a planned stop on this day"
                    >
                      + Add Stop
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

