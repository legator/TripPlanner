'use client';

import { useMemo } from 'react';
import { DayPlan } from '@/lib/types';
import { LiveDrivingPosition } from '@/lib/location';
import { findUpcomingStopOnDay } from '@/lib/routeProgress';

interface MinimizedDrivingBarProps {
  day: DayPlan;
  dayIndex: number;
  totalDays: number;
  currentPosition: LiveDrivingPosition | null;
  onExpand: () => void;
  onExit: () => void;
}

export default function MinimizedDrivingBar({
  day,
  dayIndex,
  totalDays,
  currentPosition,
  onExpand,
  onExit,
}: MinimizedDrivingBarProps) {
  // Determine upcoming target stop from route progress engine
  const targetInfo = useMemo(() => {
    return findUpcomingStopOnDay(
      day,
      dayIndex,
      currentPosition ? { lat: currentPosition.lat, lng: currentPosition.lng } : null
    );
  }, [day, dayIndex, currentPosition]);

  const speedKmh = currentPosition?.speed != null ? Math.round(currentPosition.speed * 3.6) : 0;
  const isMoving = speedKmh > 5;
  const targetStop = targetInfo?.targetStop;
  const distanceKm = targetInfo?.distanceToTargetKm ?? 0;
  const effectiveSpeed = speedKmh > 20 ? speedKmh : 70;
  const driveTimeMin = Math.round((distanceKm / effectiveSpeed) * 60);
  const isArrived = distanceKm < 0.25;

  const distDisplay = distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`;
  const etaHours = Math.floor(driveTimeMin / 60);
  const etaMins = Math.round(driveTimeMin % 60);
  const etaDisplay = etaHours > 0 ? `${etaHours}h ${etaMins}m` : `${etaMins}m`;

  return (
    <aside
      aria-label="Driving mode quick status"
      className="fixed bottom-4 left-3 right-3 sm:left-6 sm:right-auto sm:w-[440px] z-40 animate-slideUp pointer-events-auto"
    >
      <div
        onClick={onExpand}
        className="group relative bg-gray-950/95 dark:bg-black/95 text-white backdrop-blur-xl border border-blue-500/30 hover:border-blue-400/60 rounded-2xl p-3.5 shadow-2xl flex items-center justify-between gap-3 cursor-pointer transition-all transform active:scale-[0.99]"
      >
        {/* Glow accent */}
        <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600/30 to-indigo-600/30 rounded-2xl blur opacity-75 group-hover:opacity-100 transition duration-300 pointer-events-none" />

        <div className="relative flex items-center gap-3 min-w-0 flex-1">
          {/* Live GPS / Speed Badge */}
          <div className="flex flex-col items-center justify-center w-12 h-12 rounded-xl bg-blue-950/70 border border-blue-500/30 shrink-0">
            <span className="text-[9px] font-bold text-blue-300 uppercase tracking-wider flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              GPS
            </span>
            <span className="text-sm font-black text-white leading-tight">
              {isMoving ? speedKmh : '0'}
            </span>
            <span className="text-[8px] text-gray-400 font-medium">km/h</span>
          </div>

          {/* Target Stop & Stats */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[10px] text-blue-300 font-semibold mb-0.5">
              <span>Day {dayIndex + 1}/{totalDays}</span>
              <span>•</span>
              <span className="truncate">
                {isArrived ? 'Arrived!' : `Next: ${targetStop?.name || 'Destination'}`}
              </span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-base font-extrabold text-white tracking-tight">
                {distDisplay}
              </span>
              <span className="text-xs font-semibold text-emerald-400">
                {etaDisplay}
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="relative flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Expand Button */}
          <button
            type="button"
            onClick={onExpand}
            className="py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md flex items-center gap-1 transition-all"
            title="Expand to Full Driving HUD"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
            <span className="hidden xs:inline sm:inline">Expand</span>
          </button>

          {/* Exit Button */}
          <button
            type="button"
            onClick={onExit}
            className="p-2 rounded-xl bg-red-600/80 hover:bg-red-500 text-white text-xs font-bold transition-all"
            title="Exit Driving Mode"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
