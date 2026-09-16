'use client';

import { useState, useMemo, useCallback } from 'react';
import { DayPlan, Place, PlaceType } from '@/lib/types';
import { LiveDrivingPosition, calculateHaversineDistanceKm, getNavigationAppUrl } from '@/lib/location';

export type QuickStopCategory = 'gas' | 'food' | 'rest';

interface DrivingHUDProps {
  day: DayPlan;
  dayIndex: number;
  totalDays: number;
  currentPosition: LiveDrivingPosition | null;
  autoFollow: boolean;
  onRecenter: () => void;
  onExit: () => void;
  wakeLockActive: boolean;
  onFocusPlace?: (place: Place | null) => void;
  onAddStop?: (place: Place) => void;
  mapProvider?: string;
}

interface PlaceWithDistance extends Place {
  distanceKm: number;
  driveTimeMin: number;
}

export default function DrivingHUD({
  day,
  dayIndex,
  totalDays,
  currentPosition,
  autoFollow,
  onRecenter,
  onExit,
  wakeLockActive,
  onFocusPlace,
  onAddStop,
  mapProvider,
}: DrivingHUDProps) {
  const [showNavMenu, setShowNavMenu] = useState(false);
  const [activeCategory, setActiveCategory] = useState<QuickStopCategory | null>(null);
  const [livePlaces, setLivePlaces] = useState<Record<QuickStopCategory, Place[]>>({
    gas: [],
    food: [],
    rest: [],
  });
  const [isLoadingNearby, setIsLoadingNearby] = useState(false);
  const [navTargetPlace, setNavTargetPlace] = useState<Place | null>(null);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Speed in km/h (position.speed is in m/s)
  const speedKmh = currentPosition?.speed && currentPosition.speed > 0.5
    ? Math.round(currentPosition.speed * 3.6)
    : 0;

  // Next target destination for this day (defaults to endLocation)
  const nextTarget = day.mainStops.length > 0 ? day.mainStops[0] : day.endLocation;
  const targetLocation = nextTarget.location;
  const targetName = nextTarget.name.split(',')[0];

  // Remaining distance in km
  const distanceRemainingKm = currentPosition
    ? calculateHaversineDistanceKm(
        { lat: currentPosition.lat, lng: currentPosition.lng },
        targetLocation
      )
    : day.distanceKm;

  // Rough ETA minutes (if moving use current speed, else assume 70 km/h average driving speed)
  const effectiveSpeedKmh = speedKmh > 20 ? speedKmh : 70;
  const etaMinutes = Math.round((distanceRemainingKm / effectiveSpeedKmh) * 60);
  const etaHours = Math.floor(etaMinutes / 60);
  const etaMins = etaMinutes % 60;
  const etaFormatted = etaHours > 0 ? `${etaHours}h ${etaMins}m` : `${etaMins} min`;

  // Heading degrees and cardinal direction
  const heading = currentPosition?.heading != null ? Math.round(currentPosition.heading) : null;
  const getCardinalDirection = (deg: number | null) => {
    if (deg == null) return '';
    const val = Math.floor((deg / 22.5) + 0.5);
    const arr = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return arr[val % 16];
  };

  // Helper to compute distance and drive time from current GPS position (or start location)
  const computeDistanceAndDriveTime = useCallback(
    (placeLocation: { lat: number; lng: number }): { distanceKm: number; driveTimeMin: number } => {
      const origin = currentPosition
        ? { lat: currentPosition.lat, lng: currentPosition.lng }
        : day.startLocation.location;
      const dist = calculateHaversineDistanceKm(origin, placeLocation);
      const estSpeed = speedKmh > 25 ? speedKmh : 65;
      const mins = Math.max(1, Math.round((dist / estSpeed) * 60));
      return { distanceKm: dist, driveTimeMin: mins };
    },
    [currentPosition, day.startLocation.location, speedKmh]
  );

  // Group and sort places for each quick-stop category
  const categorizedPlaces = useMemo(() => {
    const processList = (routePlaces: Place[], liveList: Place[], defaultType: PlaceType): PlaceWithDistance[] => {
      const mergedMap = new Map<string, Place>();
      routePlaces.forEach((p) => mergedMap.set(p.id || `${p.location.lat},${p.location.lng}`, p));
      liveList.forEach((p) => mergedMap.set(p.id || `${p.location.lat},${p.location.lng}`, p));

      return Array.from(mergedMap.values())
        .map((p) => {
          const { distanceKm, driveTimeMin } = computeDistanceAndDriveTime(p.location);
          return {
            ...p,
            type: p.type || defaultType,
            distanceKm,
            driveTimeMin,
          };
        })
        .sort((a, b) => a.distanceKm - b.distanceKm);
    };

    // Gas Stations
    const gas = processList(day.gasStops || [], livePlaces.gas, PlaceType.GAS_STATION);

    // Food / Restaurants / Cafes
    const food = processList(day.restaurants || [], livePlaces.food, PlaceType.RESTAURANT);

    // Rest Stops / Places to relax (attractions, campgrounds, viewpoints, rest areas)
    const restSource = [
      ...(day.attractions || []),
      ...(day.campgrounds || []),
    ];
    const rest = processList(restSource, livePlaces.rest, PlaceType.REST_STOP);

    return { gas, food, rest };
  }, [day, livePlaces, computeDistanceAndDriveTime]);

  // Format distance cleanly (e.g. "850 m" or "4.2 km")
  const formatDistance = (km: number) => {
    if (km < 1) return `${Math.round(km * 1000)} m`;
    return `${km.toFixed(1)} km`;
  };

  // Fetch live nearby POIs around current GPS coordinates
  const fetchNearbyPOIs = async (category: QuickStopCategory) => {
    const coords = currentPosition
      ? { lat: currentPosition.lat, lng: currentPosition.lng }
      : day.startLocation.location;

    setIsLoadingNearby(true);
    const typeMapping: Record<QuickStopCategory, string> = {
      gas: 'gas_station',
      food: 'restaurant',
      rest: 'rest_stop',
    };

    try {
      const params = new URLSearchParams({
        lat: String(coords.lat),
        lng: String(coords.lng),
        type: typeMapping[category],
        radius: '30000', // 30 km radius
      });
      if (mapProvider) params.set('provider', mapProvider);

      const res = await fetch(`/api/places/nearby?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.places && Array.isArray(data.places)) {
          setLivePlaces((prev) => ({
            ...prev,
            [category]: data.places,
          }));
          showNotice(`Found ${data.places.length} nearby ${category === 'gas' ? 'gas stations' : category === 'food' ? 'restaurants' : 'rest stops'}`);
        }
      }
    } catch (err) {
      console.error('Failed to fetch nearby POIs:', err);
      showNotice('Unable to scan live area right now');
    } finally {
      setIsLoadingNearby(false);
    }
  };

  const handleOpenCategory = (cat: QuickStopCategory) => {
    if (activeCategory === cat) {
      setActiveCategory(null);
    } else {
      setActiveCategory(cat);
      // If we don't have many places for this category yet, auto-scan nearby
      if (categorizedPlaces[cat].length < 2 && livePlaces[cat].length === 0) {
        fetchNearbyPOIs(cat);
      }
    }
  };

  const showNotice = (msg: string) => {
    setActionSuccessMsg(msg);
    setTimeout(() => setActionSuccessMsg(null), 3000);
  };

  const handleFocusPlace = (place: Place) => {
    onFocusPlace?.(place);
    showNotice(`Centered map on ${place.name.split(',')[0]}`);
  };

  const handleAddStopToRoute = (place: Place) => {
    onAddStop?.(place);
    showNotice(`Added ${place.name.split(',')[0]} to route`);
  };

  const handleOpenNavApp = (app: 'google' | 'apple' | 'waze', destinationOverride?: { lat: number; lng: number }) => {
    setShowNavMenu(false);
    setNavTargetPlace(null);
    const origin = currentPosition ? { lat: currentPosition.lat, lng: currentPosition.lng } : undefined;
    const dest = destinationOverride || { lat: day.endLocation.location.lat, lng: day.endLocation.location.lng };
    const intermediateStops = destinationOverride
      ? undefined
      : day.mainStops.map((s) => ({ lat: s.location.lat, lng: s.location.lng }));
    const url = getNavigationAppUrl(app, dest, origin, intermediateStops);
    window.open(url, '_blank');
  };

  const closestGas = categorizedPlaces.gas[0];
  const closestFood = categorizedPlaces.food[0];
  const closestRest = categorizedPlaces.rest[0];

  return (
    <div className="absolute inset-0 pointer-events-none z-30 flex flex-col justify-between p-2 sm:p-4 md:p-5 select-none font-sans safe-pt safe-pb safe-pl safe-pr overflow-hidden">
      {/* ── TOP STACK: Target Info & Quick Stops Bar ── */}
      <div className="flex flex-col gap-1.5 sm:gap-2 max-w-xl mx-auto w-full">
        {/* Top Header Card */}
        <div className="pointer-events-auto bg-gray-900/90 dark:bg-black/90 backdrop-blur-md text-white rounded-2xl p-2.5 sm:p-4 shadow-2xl border border-white/10 flex items-center justify-between gap-2.5 sm:gap-4 animate-slideDown">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-11 sm:h-11 rounded-xl bg-blue-600 flex items-center justify-center text-base sm:text-xl flex-shrink-0 shadow-lg shadow-blue-500/30">
              🧭
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400">
                  Day {day.dayNumber || dayIndex + 1} of {totalDays}
                </span>
                {wakeLockActive && (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 font-semibold px-1.5 py-0.5 rounded flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Awake
                  </span>
                )}
              </div>
              <h2 className="text-xs sm:text-base font-bold truncate text-white">
                Next: {targetName}
              </h2>
              <p className="text-[10px] sm:text-xs text-gray-400 truncate">
                {day.startLocation.name.split(',')[0]} → {day.endLocation.name.split(',')[0]}
              </p>
            </div>
          </div>

          <div className="text-right flex-shrink-0">
            <p className="text-lg sm:text-2xl font-black text-blue-400 tracking-tight">
              {distanceRemainingKm} <span className="text-[10px] sm:text-xs font-semibold text-gray-400">km</span>
            </p>
            <p className="text-[10px] sm:text-[11px] text-gray-300 font-medium">
              ~{etaFormatted}
            </p>
          </div>
        </div>

        {/* ── QUICK STOPS TOOLBAR (Gas, Food, Rest) ── */}
        <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 w-full justify-center">
          {/* Gas Button */}
          <button
            type="button"
            onClick={() => handleOpenCategory('gas')}
            className={`flex-1 min-h-[42px] sm:min-h-[46px] py-1.5 sm:py-2.5 px-2 sm:px-3 rounded-xl text-xs font-bold shadow-lg border transition-all flex items-center justify-center gap-1.5 ${
              activeCategory === 'gas'
                ? 'bg-amber-600 text-white border-amber-400 shadow-amber-500/30 scale-[1.02]'
                : 'bg-gray-900/85 hover:bg-gray-800 text-gray-100 border-white/10 hover:border-amber-500/40 backdrop-blur-md'
            }`}
          >
            <span className="text-sm sm:text-base">⛽</span>
            <div className="flex flex-col text-left leading-tight">
              <span className="text-[10px] sm:text-[11px]">Gas</span>
              <span className="text-[9px] sm:text-[10px] text-amber-400 font-mono font-semibold">
                {closestGas ? formatDistance(closestGas.distanceKm) : 'Nearby'}
              </span>
            </div>
          </button>

          {/* Food Button */}
          <button
            type="button"
            onClick={() => handleOpenCategory('food')}
            className={`flex-1 min-h-[42px] sm:min-h-[46px] py-1.5 sm:py-2.5 px-2 sm:px-3 rounded-xl text-xs font-bold shadow-lg border transition-all flex items-center justify-center gap-1.5 ${
              activeCategory === 'food'
                ? 'bg-orange-600 text-white border-orange-400 shadow-orange-500/30 scale-[1.02]'
                : 'bg-gray-900/85 hover:bg-gray-800 text-gray-100 border-white/10 hover:border-orange-500/40 backdrop-blur-md'
            }`}
          >
            <span className="text-sm sm:text-base">🍽️</span>
            <div className="flex flex-col text-left leading-tight">
              <span className="text-[10px] sm:text-[11px]">Food</span>
              <span className="text-[9px] sm:text-[10px] text-orange-400 font-mono font-semibold">
                {closestFood ? formatDistance(closestFood.distanceKm) : 'Nearby'}
              </span>
            </div>
          </button>

          {/* Rest / Relax Button */}
          <button
            type="button"
            onClick={() => handleOpenCategory('rest')}
            className={`flex-1 min-h-[42px] sm:min-h-[46px] py-1.5 sm:py-2.5 px-2 sm:px-3 rounded-xl text-xs font-bold shadow-lg border transition-all flex items-center justify-center gap-1.5 ${
              activeCategory === 'rest'
                ? 'bg-emerald-600 text-white border-emerald-400 shadow-emerald-500/30 scale-[1.02]'
                : 'bg-gray-900/85 hover:bg-gray-800 text-gray-100 border-white/10 hover:border-emerald-500/40 backdrop-blur-md'
            }`}
          >
            <span className="text-sm sm:text-base">☕</span>
            <div className="flex flex-col text-left leading-tight">
              <span className="text-[10px] sm:text-[11px]">Rest Stop</span>
              <span className="text-[9px] sm:text-[10px] text-emerald-400 font-mono font-semibold">
                {closestRest ? formatDistance(closestRest.distanceKm) : 'Nearby'}
              </span>
            </div>
          </button>
        </div>

        {/* Temporary Feedback Notification */}
        {actionSuccessMsg && (
          <div className="pointer-events-auto self-center bg-blue-600/95 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-xl border border-blue-400 animate-fadeIn flex items-center gap-2">
            <span>✨</span>
            <span>{actionSuccessMsg}</span>
          </div>
        )}
      </div>

      {/* ── EXPANDED POI DRAWER / MODAL ── */}
      {activeCategory && (
        <div className="pointer-events-auto max-w-xl mx-auto w-full max-h-[55vh] sm:max-h-[50vh] landscape:max-h-[65vh] flex flex-col bg-gray-950/95 backdrop-blur-xl border border-white/20 rounded-2xl sm:rounded-3xl p-3 sm:p-5 shadow-2xl text-white my-auto animate-slideUp overflow-hidden">
          {/* Drawer Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10 flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">
                {activeCategory === 'gas' ? '⛽' : activeCategory === 'food' ? '🍽️' : '☕'}
              </span>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white">
                  {activeCategory === 'gas'
                    ? 'Upcoming Gas Stations'
                    : activeCategory === 'food'
                    ? 'Upcoming Restaurants & Cafes'
                    : 'Rest Stops & Relax Areas'}
                </h3>
                <p className="text-[11px] text-gray-400">
                  {categorizedPlaces[activeCategory].length} stops found ahead on route
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Scan live GPS Area */}
              <button
                type="button"
                onClick={() => fetchNearbyPOIs(activeCategory)}
                disabled={isLoadingNearby}
                className="px-2.5 py-1.5 rounded-lg bg-blue-600/80 hover:bg-blue-600 disabled:opacity-50 text-[11px] font-semibold text-white flex items-center gap-1.5 transition-all shadow"
                title="Scan immediate surroundings around GPS coordinates"
              >
                <span className={isLoadingNearby ? 'animate-spin' : ''}>🔄</span>
                <span className="hidden sm:inline">{isLoadingNearby ? 'Scanning...' : 'Scan GPS'}</span>
              </button>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => setActiveCategory(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-gray-300 hover:text-white transition-colors"
                title="Close list"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Places List */}
          <div className="overflow-y-auto divide-y divide-white/5 py-2 pr-1 flex-1 space-y-2.5 scrollbar-thin scrollbar-thumb-white/20">
            {categorizedPlaces[activeCategory].length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p className="text-2xl mb-2">🔎</p>
                <p className="text-xs font-semibold">No {activeCategory} stops currently listed along this leg.</p>
                <button
                  type="button"
                  onClick={() => fetchNearbyPOIs(activeCategory)}
                  className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-lg"
                >
                  <span>📡</span> Search Live Around GPS
                </button>
              </div>
            ) : (
              categorizedPlaces[activeCategory].map((place) => (
                <div
                  key={place.id || `${place.location.lat},${place.location.lng}`}
                  className="bg-white/5 hover:bg-white/10 p-3 rounded-2xl border border-white/5 transition-all flex flex-col gap-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-xs sm:text-sm text-white truncate">
                          {place.name}
                        </h4>
                        {place.isOpen != null && (
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                              place.isOpen
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-red-500/20 text-red-300'
                            }`}
                          >
                            {place.isOpen ? 'Open' : 'Closed'}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400 truncate mt-0.5">
                        {place.vicinity || place.address}
                      </p>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <span className="text-xs sm:text-sm font-black text-amber-400 tabular-nums">
                        {formatDistance(place.distanceKm)}
                      </span>
                      <span className="block text-[10px] text-gray-400">
                        ~{place.driveTimeMin} min
                      </span>
                    </div>
                  </div>

                  {/* Actions Row */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/5 text-xs">
                    {place.rating ? (
                      <span className="text-[11px] text-yellow-400 font-semibold flex items-center gap-1">
                        ⭐ {place.rating}
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-500">Verified Stop</span>
                    )}

                    <div className="flex items-center gap-1.5">
                      {/* View on Map */}
                      <button
                        type="button"
                        onClick={() => handleFocusPlace(place)}
                        className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium text-[11px] flex items-center gap-1 transition-colors"
                        title="Show on map"
                      >
                        <span>📍</span>
                        <span>Map</span>
                      </button>

                      {/* Add Stop to Route */}
                      {onAddStop && (
                        <button
                          type="button"
                          onClick={() => handleAddStopToRoute(place)}
                          className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium text-[11px] flex items-center gap-1 transition-colors"
                          title="Add as stop to trip"
                        >
                          <span>➕</span>
                          <span className="hidden sm:inline">Add</span>
                        </button>
                      )}

                      {/* Launch Turn-by-Turn Navigation */}
                      <button
                        type="button"
                        onClick={() => setNavTargetPlace(place)}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] flex items-center gap-1 shadow-md transition-all active:scale-95"
                        title="Navigate to this stop"
                      >
                        <span>↗️</span>
                        <span>Go</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── NAVIGATION HANDOFF CHOOSER (for specific stop or whole route) ── */}
      {navTargetPlace && (
        <div className="pointer-events-auto fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-white/20 rounded-2xl p-5 max-w-sm w-full text-white shadow-2xl animate-scaleUp">
            <h3 className="text-base font-bold mb-1">Navigate to {navTargetPlace.name.split(',')[0]}</h3>
            <p className="text-xs text-gray-400 mb-4">Choose your preferred navigation app:</p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleOpenNavApp('google', navTargetPlace.location)}
                className="w-full py-2.5 px-4 bg-white/10 hover:bg-blue-600 rounded-xl text-left text-xs font-semibold flex items-center gap-3 transition-colors"
              >
                <span className="text-lg">🗺️</span>
                <span>Google Maps</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenNavApp('apple', navTargetPlace.location)}
                className="w-full py-2.5 px-4 bg-white/10 hover:bg-blue-600 rounded-xl text-left text-xs font-semibold flex items-center gap-3 transition-colors"
              >
                <span className="text-lg">🍏</span>
                <span>Apple Maps</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenNavApp('waze', navTargetPlace.location)}
                className="w-full py-2.5 px-4 bg-white/10 hover:bg-blue-600 rounded-xl text-left text-xs font-semibold flex items-center gap-3 transition-colors"
              >
                <span className="text-lg">🚗</span>
                <span>Waze Navigation</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setNavTargetPlace(null)}
              className="mt-4 w-full py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── BOTTOM ROW: Speedometer, Camera Recenter & Action Buttons ── */}
      <div className="pointer-events-auto w-full flex items-end justify-between gap-1.5 sm:gap-3">
        {/* Speedometer Widget */}
        <div className="bg-gray-900/90 dark:bg-black/90 backdrop-blur-md text-white rounded-xl sm:rounded-2xl p-2 sm:p-4 shadow-2xl border border-white/10 flex items-center gap-2 sm:gap-3">
          <div className="text-center min-w-[48px] sm:min-w-[60px]">
            <span className="text-2xl sm:text-4xl font-black tabular-nums tracking-tighter text-white">
              {speedKmh}
            </span>
            <span className="block text-[8px] sm:text-[10px] font-bold uppercase tracking-wider text-gray-400 -mt-0.5 sm:-mt-1">
              km/h
            </span>
          </div>

          {heading != null && (
            <div className="border-l border-white/10 pl-2 sm:pl-3 text-center">
              <span className="text-xs sm:text-sm font-bold text-blue-400 block">
                {getCardinalDirection(heading)}
              </span>
              <span className="text-[9px] sm:text-[10px] font-mono text-gray-400">
                {heading}°
              </span>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Recenter Button (shows when user panned away) */}
          {!autoFollow && (
            <button
              type="button"
              onClick={onRecenter}
              className="py-2.5 sm:py-3 px-3 sm:px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[11px] sm:text-xs font-bold shadow-xl flex items-center gap-1.5 transition-all transform hover:scale-105 active:scale-95 animate-bounce"
            >
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <circle cx="12" cy="12" r="4" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v3m0 14v3m10-10h-3M5 12H2" />
              </svg>
              <span>Recenter</span>
            </button>
          )}

          {/* External Navigation Handoff Menu (whole route) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowNavMenu(!showNavMenu)}
              className="py-2.5 sm:py-3 px-2.5 sm:px-3.5 rounded-xl bg-gray-900/90 dark:bg-black/90 hover:bg-gray-800 text-white text-[11px] sm:text-xs font-semibold shadow-xl border border-white/10 flex items-center gap-1 transition-all"
              title="Open full day route in Google Maps, Waze, or Apple Maps"
            >
              <span>🧭</span>
              <span className="hidden xs:inline sm:inline">Nav</span>
              <svg className="w-3 h-3 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showNavMenu && (
              <div className="absolute bottom-full right-0 mb-2 w-44 sm:w-48 bg-gray-900 dark:bg-black border border-white/15 rounded-xl shadow-2xl overflow-hidden py-1 z-50 text-white">
                <button
                  type="button"
                  onClick={() => handleOpenNavApp('google')}
                  className="w-full text-left px-3.5 py-2 hover:bg-white/10 text-xs flex items-center gap-2 transition-colors"
                >
                  <span>🗺️</span>
                  <span>Google Maps</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenNavApp('apple')}
                  className="w-full text-left px-3.5 py-2 hover:bg-white/10 text-xs flex items-center gap-2 transition-colors"
                >
                  <span>🍏</span>
                  <span>Apple Maps</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenNavApp('waze')}
                  className="w-full text-left px-3.5 py-2 hover:bg-white/10 text-xs flex items-center gap-2 transition-colors"
                >
                  <span>🚗</span>
                  <span>Waze Navigation</span>
                </button>
              </div>
            )}
          </div>

          {/* Exit Driving Mode Button */}
          <button
            type="button"
            onClick={onExit}
            className="py-2.5 sm:py-3 px-3 sm:px-4 rounded-xl bg-red-600/90 hover:bg-red-500 text-white text-[11px] sm:text-xs font-bold shadow-xl flex items-center gap-1 transition-all transform active:scale-95"
            title="Exit Driving Mode and return to Trip Planner"
          >
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span>Exit</span>
          </button>
        </div>
      </div>
    </div>
  );
}
