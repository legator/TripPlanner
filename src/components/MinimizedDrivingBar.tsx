'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { DayPlan } from '@/lib/types';
import { LiveDrivingPosition } from '@/lib/location';
import { findUpcomingStopOnDay } from '@/lib/routeProgress';

const PipPlugin = registerPlugin<{
  enterPip(): Promise<void>;
  isPipSupported(): Promise<{ supported: boolean }>;
}>('PipPlugin');

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
  // If it's a web application, hide minimize mode completely
  const isMobile = Capacitor.isNativePlatform();

  const [hasPipSupport, setHasPipSupport] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (Capacitor.getPlatform() === 'android') {
      PipPlugin.isPipSupported()
        .then((res) => setHasPipSupport(res.supported))
        .catch(() => setHasPipSupport(false));
    }
  }, []);

  // Determine upcoming target stop from route progress engine
  const targetInfo = useMemo(() => {
    return findUpcomingStopOnDay(
      day,
      dayIndex,
      currentPosition ? { lat: currentPosition.lat, lng: currentPosition.lng } : null
    );
  }, [day, dayIndex, currentPosition]);

  const speedKmh = currentPosition?.speed != null ? Math.round(currentPosition.speed * 3.6) : 0;
  const targetStop = targetInfo?.targetStop;
  const distanceKm = targetInfo?.distanceToTargetKm ?? 0;
  const effectiveSpeed = speedKmh > 20 ? speedKmh : 70;
  const driveTimeMin = Math.round((distanceKm / effectiveSpeed) * 60);
  const isArrived = distanceKm < 0.25;

  const distDisplay = distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`;
  const etaHours = Math.floor(driveTimeMin / 60);
  const etaMins = Math.round(driveTimeMin % 60);
  const etaDisplay = etaHours > 0 ? `${etaHours}h ${etaMins}m` : `${etaMins}m`;

  // Touch drag handlers for floating PiP window
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;

    dragRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      initialX: position ? position.x : rect.left,
      initialY: position ? position.y : rect.top,
    };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragRef.current) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - dragRef.current.startX;
    const deltaY = touch.clientY - dragRef.current.startY;

    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const cardW = cardRef.current?.offsetWidth || 230;
    const cardH = cardRef.current?.offsetHeight || 140;

    const newX = Math.max(10, Math.min(screenW - cardW - 10, dragRef.current.initialX + deltaX));
    const newY = Math.max(40, Math.min(screenH - cardH - 20, dragRef.current.initialY + deltaY));

    setPosition({ x: newX, y: newY });
  };

  const handleTouchEnd = () => {
    dragRef.current = null;
  };

  const handleEnterOsPip = async () => {
    try {
      await PipPlugin.enterPip();
    } catch (e) {
      console.warn('Native PiP error:', e);
    }
  };

  // If on web, hide completely as requested
  if (!isMobile) {
    return null;
  }

  const defaultPositionClass = position
    ? ''
    : 'bottom-20 right-3';

  const dynamicStyle = position
    ? { left: `${position.x}px`, top: `${position.y}px` }
    : undefined;

  return (
    <div
      ref={cardRef}
      style={dynamicStyle}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`fixed z-50 w-[230px] select-none pointer-events-auto animate-fadeIn ${defaultPositionClass}`}
    >
      <div className="relative overflow-hidden rounded-2xl bg-gray-950/95 dark:bg-black/95 text-white backdrop-blur-2xl border border-blue-500/50 shadow-2xl p-2.5 flex flex-col gap-2 transition-shadow hover:shadow-blue-500/20 active:scale-[0.99]">
        {/* Glow accent */}
        <div className="absolute -inset-0.5 bg-gradient-to-br from-blue-600/30 via-indigo-600/20 to-emerald-500/20 rounded-2xl blur opacity-75 pointer-events-none" />

        {/* Top Header: Drag handle, Day info, Speed, Controls */}
        <div className="relative flex items-center justify-between gap-1.5 border-b border-white/10 pb-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-wider text-blue-400 truncate">
              Day {dayIndex + 1}/{totalDays}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Speed pill */}
            <span className="text-[9px] font-mono font-bold bg-blue-900/60 text-blue-200 border border-blue-500/30 px-1 py-0.2 rounded">
              {speedKmh} km/h
            </span>

            {/* Android System PiP button */}
            {hasPipSupport && (
              <button
                type="button"
                onClick={handleEnterOsPip}
                className="w-6 h-6 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center text-[10px] shadow"
                title="Pop out into Android OS Picture-in-Picture window"
              >
                🗖
              </button>
            )}

            {/* Expand back to HUD */}
            <button
              type="button"
              onClick={onExpand}
              className="w-6 h-6 rounded-lg bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center text-xs shadow transition-transform active:scale-95"
              title="Expand to Full Navigation"
            >
              ⤢
            </button>

            {/* Exit Driving */}
            <button
              type="button"
              onClick={onExit}
              className="w-6 h-6 rounded-lg bg-red-600/80 hover:bg-red-500 text-white flex items-center justify-center text-xs transition-colors"
              title="Exit Navigation"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Middle Content: Next Turn / Stop + Distance */}
        <div className="relative flex items-center gap-2 cursor-pointer" onClick={onExpand}>
          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-base shrink-0 shadow-md">
            {isArrived ? '🏁' : '↗️'}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-gray-400 font-medium truncate">
              {isArrived ? 'Arrived at' : 'Next Stop'}
            </p>
            <h4 className="text-xs font-bold text-white truncate leading-tight">
              {targetStop?.name ? targetStop.name.split(',')[0] : 'Destination'}
            </h4>
          </div>
        </div>

        {/* Bottom Bar: Distance & ETA */}
        <div
          className="relative flex items-baseline justify-between bg-white/5 rounded-xl px-2 py-1 border border-white/5 cursor-pointer"
          onClick={onExpand}
        >
          <div className="flex items-baseline gap-1">
            <span className="text-sm font-black text-white tabular-nums tracking-tight">
              {distDisplay}
            </span>
          </div>
          <span className="text-[10px] font-bold text-emerald-400">
            {isArrived ? 'Here' : `~${etaDisplay}`}
          </span>
        </div>
      </div>
    </div>
  );
}
