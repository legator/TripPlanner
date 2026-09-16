'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleMapsProvider } from '@/components/GoogleMapsProvider';
import MapView from '@/components/MapView';
import { HereMapsProvider } from '@/components/HereMapsProvider';
import HereMapView from '@/components/HereMapView';
import MapProviderPicker, { getStoredMapProvider, storeMapProvider, MapProviderChoice } from '@/components/MapProviderPicker';
import Sidebar from '@/components/Sidebar';
import ErrorBoundary from '@/components/ErrorBoundary';
import { Waypoint, TripPlan, TripSettings, Place } from '@/lib/types';
import { DEFAULT_SETTINGS } from '@/lib/constants';
import { toggleRestDay, setDayEndAtSegment, applyUserEdits, applyOptimizedSegments, emptyUserEdits } from '@/lib/tripPlanEditor';
import { optimizeDayRoute } from '@/lib/tripOptimization';
import { saveTripToStorage, loadTripFromStorage, clearTripFromStorage } from '@/lib/tripStorage';
import { decodeTripFromURL, loadTripFromShareParam } from '@/lib/tripShare';
import UpdateTripModal, { TripUpdateMode } from '@/components/UpdateTripModal';
import DrivingHUD from '@/components/DrivingHUD';
import { LiveDrivingPosition, watchCurrentPosition } from '@/lib/location';
import { findActiveTripDayAndTarget } from '@/lib/routeProgress';
import { requestScreenWakeLock, releaseScreenWakeLock } from '@/lib/wakeLock';
import { format } from 'date-fns';
import type { UserEdits } from '@/lib/tripPlanEditor';
import type { SavedTrip } from '@/lib/savedTrips';

export default function Home() {
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [settings, setSettings] = useState<TripSettings>(DEFAULT_SETTINGS);
  const [tripPlan, setTripPlan] = useState<TripPlan | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [isUpdateTripModalOpen, setIsUpdateTripModalOpen] = useState(false);
  const [isDrivingMode, setIsDrivingMode] = useState(false);
  const [drivingDayIndex, setDrivingDayIndex] = useState(0);
  const [drivingPosition, setDrivingPosition] = useState<LiveDrivingPosition | null>(null);
  const [autoFollow, setAutoFollow] = useState(true);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [mapProvider, setMapProvider] = useState<MapProviderChoice | null | undefined>(null);
  const [focusedDrivingPlace, setFocusedDrivingPlace] = useState<Place | null>(null);
  const [mobileTab, setMobileTab] = useState<'sidebar' | 'map'>('sidebar');

  // Accumulated waypoints used for the active plan (includes search-added stops)
  const planWaypointsRef = useRef<Waypoint[]>([]);
  // Track user edits (rest days, day-end choices) so they survive re-plans
  const userEditsRef = useRef<UserEdits>(emptyUserEdits());

  // On mount: restore from URL hash first, then localStorage
  useEffect(() => {
    const init = async () => {
    // Resolve map provider once and reuse below
    const storedProvider = getStoredMapProvider();
    const envProvider = process.env.NEXT_PUBLIC_MAP_PROVIDER as MapProviderChoice | undefined;
    const resolvedProvider = storedProvider ?? envProvider ?? undefined;

    // Check ?share=id param first (KV short link)
    const fromShare = await loadTripFromShareParam();
    if (fromShare) {
      setWaypoints(fromShare.waypoints);
      setSettings(fromShare.settings);
      setTripPlan(fromShare.tripPlan);
      planWaypointsRef.current = [...fromShare.waypoints];
      setMapProvider(resolvedProvider);
      return;
    }

    const fromURL = decodeTripFromURL();
    if (fromURL) {
      setWaypoints(fromURL.waypoints);
      setSettings(fromURL.settings);
      setTripPlan(fromURL.tripPlan);
      planWaypointsRef.current = [...fromURL.waypoints];
      // Clear the hash so bookmarking the current URL doesn't re-load stale data
      history.replaceState(null, '', window.location.pathname);
      setMapProvider(resolvedProvider);
      return;
    }

    const saved = loadTripFromStorage();
    if (saved) {
      setWaypoints(saved.waypoints);
      setSettings(saved.settings);
      if (saved.tripPlan) setTripPlan(saved.tripPlan);
      planWaypointsRef.current = [...saved.waypoints];
    }

    setMapProvider(resolvedProvider);
    }; // end init
    init();
  }, []);

  // Live GPS tracking and screen wake lock for Driving Mode
  useEffect(() => {
    if (!isDrivingMode) {
      releaseScreenWakeLock();
      setWakeLockActive(false);
      setDrivingPosition(null);
      return;
    }

    requestScreenWakeLock().then((active) => setWakeLockActive(active));

    const unsubscribe = watchCurrentPosition(
      (pos) => setDrivingPosition(pos),
      (err) => console.warn('GPS tracking error:', err)
    );

    return () => {
      unsubscribe();
      releaseScreenWakeLock();
      setWakeLockActive(false);
    };
  }, [isDrivingMode]);

  // Auto-save whenever waypoints, settings, or tripPlan changes
  useEffect(() => {
    saveTripToStorage(waypoints, settings, tripPlan);
  }, [waypoints, settings, tripPlan]);

  const handlePlanTrip = useCallback(async () => {
    if (waypoints.length < 2) {
      setError('Please add at least 2 places to plan your trip.');
      return;
    }

    setIsPlanning(true);
    setError(null);

    // Snapshot the current waypoints as the base for the plan
    planWaypointsRef.current = [...waypoints];

    try {
      const response = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waypoints, settings, provider: mapProvider }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to plan trip');
      }

      setTripPlan(data);
      setSelectedDay(null);
      setMobileTab('map');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'An unexpected error occurred'
      );
    } finally {
      setIsPlanning(false);
    }
  }, [waypoints, settings, mapProvider]);

  const handleReset = useCallback(() => {
    setTripPlan(null);
    setSelectedDay(null);
    setError(null);
    planWaypointsRef.current = [];
    userEditsRef.current = emptyUserEdits();
    clearTripFromStorage();
  }, []);

  const handleToggleRestDay = useCallback((dayIndex: number) => {
    setTripPlan((prev) => {
      if (!prev) return prev;
      const day = prev.days[dayIndex];
      const edits = userEditsRef.current;

      if (day.isRestDay) {
        // Removing a rest day — untrack its location
        const loc = day.startLocation.location;
        edits.restDayAfterLocs = edits.restDayAfterLocs.filter(
          (l) => Math.abs(l.lat - loc.lat) > 0.008 || Math.abs(l.lng - loc.lng) > 0.008
        );
      } else {
        // Adding a rest day — track the end location of this driving day
        edits.restDayAfterLocs.push({ ...day.endLocation.location });
      }

      return toggleRestDay(prev, dayIndex);
    });
  }, []);

  const handleSetDayEnd = useCallback((dayIndex: number, segmentCount: number) => {
    setTripPlan((prev) =>
      prev
        ? setDayEndAtSegment(
            prev,
            dayIndex,
            segmentCount,
            settings.checkoutTime,
            settings.checkinTime,
            settings.fuelPricePerLiter,
            settings.fuelEfficiencyLPer100km
          )
        : prev
    );
  }, [settings.checkoutTime, settings.checkinTime, settings.fuelPricePerLiter, settings.fuelEfficiencyLPer100km]);

  const handleOptimizeRoute = useCallback(async (dayIndex: number) => {
    if (!tripPlan) return;

    setIsPlanning(true);
    setError(null);

    try {
      const day = tripPlan.days[dayIndex];
      const optimizedSegments = await optimizeDayRoute(day, settings, mapProvider || 'google');

      setTripPlan((prev) =>
        prev
          ? applyOptimizedSegments(
              prev,
              dayIndex,
              optimizedSegments,
              settings.checkoutTime,
              settings.checkinTime,
              settings.fuelPricePerLiter,
              settings.fuelEfficiencyLPer100km
            )
          : prev
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to optimize route');
    } finally {
      setIsPlanning(false);
    }
  }, [tripPlan, settings, mapProvider]);

  // Add an overnight stop and re-plan — accumulates stops, doesn't touch main waypoint list
  const handleAddOvernightStop = useCallback(async (dayIndex: number, waypoint: Waypoint) => {
    // Build on the accumulated plan waypoints (not the original list)
    const currentPlanWaypoints = [...planWaypointsRef.current];
    const insertAt = Math.min(dayIndex + 2, currentPlanWaypoints.length);
    currentPlanWaypoints.splice(insertAt, 0, waypoint);

    // Save so next additions build on this
    planWaypointsRef.current = currentPlanWaypoints;

    setIsPlanning(true);
    setError(null);
    try {
      const response = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waypoints: currentPlanWaypoints, settings, provider: mapProvider }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to re-plan trip');

      // Re-apply user edits (rest days, day-end choices) on the fresh plan
      const finalPlan = applyUserEdits(
        data,
        userEditsRef.current
      );
      setTripPlan(finalPlan);
      setSelectedDay(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsPlanning(false);
    }
  }, [settings, mapProvider]);

  const addWaypoint = (wp: Waypoint) => setWaypoints((prev) => [...prev, wp]);

  const handleSetStart = useCallback((wp: Waypoint) => {
    setWaypoints((prev) => {
      if (prev.length === 0) return [wp];
      const next = [...prev];
      next[0] = wp;
      return next;
    });
    if (planWaypointsRef.current.length > 0) {
      planWaypointsRef.current[0] = wp;
    }
  }, []);

  const handleStartDayFromLocation = useCallback((dayIndex: number) => {
    setSelectedDay(dayIndex);
    setIsUpdateTripModalOpen(true);
  }, []);

  const handleStartDriving = useCallback(
    (explicitDayIndex?: number) => {
      let dayToUse = explicitDayIndex;

      // Automatically determine the active day matching current GPS location along route
      if (dayToUse === undefined && tripPlan) {
        const active = findActiveTripDayAndTarget(
          tripPlan,
          drivingPosition ? { lat: drivingPosition.lat, lng: drivingPosition.lng } : null
        );
        if (active) {
          dayToUse = active.activeDayIndex;
        }
      }

      const finalDay = dayToUse ?? (selectedDay !== null ? selectedDay : 0);
      setDrivingDayIndex(finalDay);
      setSelectedDay(finalDay);
      setAutoFollow(true);
      setIsDrivingMode(true);
      setMobileTab('map');
    },
    [tripPlan, drivingPosition, selectedDay]
  );

  const handleExitDriving = useCallback(() => {
    setIsDrivingMode(false);
    setFocusedDrivingPlace(null);
  }, []);

  const handleRecenter = useCallback(() => {
    setAutoFollow(true);
    setFocusedDrivingPlace(null);
  }, []);

  const handleFocusPlace = useCallback((place: Place | null) => {
    setFocusedDrivingPlace(place);
    if (place) {
      setAutoFollow(false);
    }
  }, []);

  const handleAddStopFromDriving = useCallback((place: Place) => {
    const wp: Waypoint = {
      id: place.id || `stop-${Date.now()}`,
      name: place.name,
      address: place.vicinity || place.address,
      location: place.location,
    };
    setWaypoints((prev) => [...prev, wp]);
  }, []);

  const handleMapUserDrag = useCallback(() => {
    if (isDrivingMode) {
      setAutoFollow(false);
    }
  }, [isDrivingMode]);

  const handleConfirmTripUpdate = useCallback(async ({
    mode,
    currentLocation,
    selectedStopIds,
    dayIndex = 0,
  }: {
    mode: TripUpdateMode;
    currentLocation: Waypoint;
    selectedStopIds?: string[];
    dayIndex?: number;
  }) => {
    setIsPlanning(true);
    setError(null);

    try {
      let newWaypoints: Waypoint[] = [];
      let updatedSettings = { ...settings };

      if (mode === 'resume_trip') {
        const currentDests = planWaypointsRef.current.length > 1
          ? planWaypointsRef.current.slice(1)
          : waypoints.slice(1);

        const keptDests = selectedStopIds && selectedStopIds.length > 0
          ? currentDests.filter((w) => selectedStopIds.includes(w.id))
          : currentDests;

        if (keptDests.length === 0) {
          throw new Error('Please select at least one remaining destination to visit.');
        }

        newWaypoints = [currentLocation, ...keptDests];
        updatedSettings = {
          ...updatedSettings,
          departureDate: format(new Date(), 'yyyy-MM-dd'),
        };
      } else if (mode === 'update_origin') {
        const dests = waypoints.length > 1 ? waypoints.slice(1) : planWaypointsRef.current.slice(1);
        if (dests.length === 0) {
          throw new Error('Add at least one destination to plan a trip.');
        }
        newWaypoints = [currentLocation, ...dests];
      } else if (mode === 'start_day') {
        if (!tripPlan || tripPlan.days.length === 0) {
          throw new Error('No active trip plan to update.');
        }

        if (dayIndex === 0) {
          const dests = waypoints.length > 1 ? waypoints.slice(1) : planWaypointsRef.current.slice(1);
          newWaypoints = [currentLocation, ...dests];
        } else {
          const remainingStops: Waypoint[] = [];
          for (let i = dayIndex; i < tripPlan.days.length; i++) {
            const d = tripPlan.days[i];
            if (d.isRestDay) continue;
            for (const ms of d.mainStops) {
              remainingStops.push({
                id: crypto.randomUUID(),
                name: ms.name,
                address: ms.name,
                location: ms.location,
              });
            }
            remainingStops.push({
              id: crypto.randomUUID(),
              name: d.endLocation.name,
              address: d.endLocation.name,
              location: d.endLocation.location,
            });
          }

          if (remainingStops.length === 0) {
            throw new Error('No remaining stops found for this day.');
          }

          newWaypoints = [currentLocation, ...remainingStops];
          const dayDate = tripPlan.days[dayIndex]?.date;
          if (dayDate) {
            updatedSettings = { ...updatedSettings, departureDate: dayDate };
          }
        }
      }

      setWaypoints(newWaypoints);
      setSettings(updatedSettings);
      planWaypointsRef.current = [...newWaypoints];

      const response = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waypoints: newWaypoints, settings: updatedSettings, provider: mapProvider }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update trip route');
      }

      const finalPlan = applyUserEdits(data, userEditsRef.current);
      setTripPlan(finalPlan);
      setSelectedDay(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while updating the trip');
      throw err;
    } finally {
      setIsPlanning(false);
    }
  }, [waypoints, settings, tripPlan, mapProvider]);

  const handleLoadSavedTrip = useCallback((trip: SavedTrip) => {
    setWaypoints(trip.waypoints);
    setSettings(trip.settings);
    setTripPlan(trip.tripPlan);
    setSelectedDay(null);
    planWaypointsRef.current = [...trip.waypoints];
    userEditsRef.current = emptyUserEdits();
  }, []);

  const sidebarEl = (
    <ErrorBoundary>
      <Sidebar
        waypoints={waypoints}
        onWaypointsChange={setWaypoints}
        settings={settings}
        onSettingsChange={setSettings}
        tripPlan={tripPlan}
        onPlanTrip={handlePlanTrip}
        onReset={handleReset}
        isPlanning={isPlanning}
        error={error}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
        onToggleRestDay={handleToggleRestDay}
        onSetDayEnd={handleSetDayEnd}
        onAddOvernightStop={handleAddOvernightStop}
        onOptimizeRoute={handleOptimizeRoute}
        onOpenUpdateTripModal={() => setIsUpdateTripModalOpen(true)}
        onStartDayFromLocation={handleStartDayFromLocation}
        onStartDriving={handleStartDriving}
        onSetStart={handleSetStart}
        mapProvider={mapProvider ?? undefined}
        onChangeMapProvider={() => setMapProvider(undefined)}
        onLoadSavedTrip={handleLoadSavedTrip}
        onToggleMobileMap={() => setMobileTab('map')}
      />
    </ErrorBoundary>
  );

  const handlePickProvider = (provider: MapProviderChoice) => {
    storeMapProvider(provider);
    setMapProvider(provider);
  };

  // Still loading from localStorage — render nothing to avoid flicker
  if (mapProvider === null) return null;

  // No choice made yet — show the picker overlay
  if (mapProvider === undefined) {
    return <MapProviderPicker onSelect={handlePickProvider} />;
  }

  const updateModalEl = tripPlan ? (
    <UpdateTripModal
      isOpen={isUpdateTripModalOpen}
      onClose={() => setIsUpdateTripModalOpen(false)}
      tripPlan={tripPlan}
      waypoints={waypoints}
      mapProvider={mapProvider ?? undefined}
      selectedDay={selectedDay}
      onConfirmUpdate={handleConfirmTripUpdate}
    />
  ) : null;

  const activeDrivingDay = tripPlan?.days[drivingDayIndex] || tripPlan?.days[0];
  const drivingHudEl = isDrivingMode && tripPlan && activeDrivingDay ? (
    <DrivingHUD
      day={activeDrivingDay}
      dayIndex={drivingDayIndex}
      totalDays={tripPlan.totalDays}
      currentPosition={drivingPosition}
      autoFollow={autoFollow}
      onRecenter={handleRecenter}
      onExit={handleExitDriving}
      wakeLockActive={wakeLockActive}
      onFocusPlace={handleFocusPlace}
      onAddStop={handleAddStopFromDriving}
      mapProvider={mapProvider ?? undefined}
      tripPlan={tripPlan}
      onChangeDay={(newDay) => {
        setDrivingDayIndex(newDay);
        setSelectedDay(newDay);
      }}
    />
  ) : null;

  const mobileMapControls = !isDrivingMode && (
    <div className="md:hidden absolute bottom-5 left-4 right-4 z-20 pointer-events-none flex flex-col gap-2 items-center safe-pb">
      {tripPlan && (
        <div className="pointer-events-auto bg-gray-900/90 dark:bg-black/90 backdrop-blur-md text-white text-[11px] font-semibold py-1.5 px-3.5 rounded-full border border-white/10 shadow-lg flex items-center gap-2 animate-fadeIn">
          <span>🚗</span>
          <span>
            {tripPlan.totalDays} Days • {tripPlan.totalDistanceKm} km
          </span>
        </div>
      )}
      <div className="pointer-events-auto flex items-center gap-2 w-full max-w-sm justify-center">
        <button
          type="button"
          onClick={() => setMobileTab('sidebar')}
          className="flex-1 py-3 px-4 bg-white dark:bg-gray-800 text-gray-800 dark:text-white rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 text-xs font-bold flex items-center justify-center gap-2 hover:bg-gray-50 active:scale-95 transition-all"
        >
          <span>📋</span>
          <span>{tripPlan ? 'Itinerary' : 'Stops & Settings'}</span>
        </button>

        {tripPlan && (
          <button
            type="button"
            onClick={() => handleStartDriving(selectedDay !== null ? selectedDay : undefined)}
            className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl shadow-2xl text-xs font-bold flex items-center justify-center gap-2 active:scale-95 transition-all shadow-blue-500/30 animate-pulse"
          >
            <span>🚗</span>
            <span>Drive</span>
          </button>
        )}
      </div>
    </div>
  );

  const sidebarContainerClass = isDrivingMode
    ? 'hidden'
    : mobileTab === 'sidebar'
    ? 'w-full h-full flex flex-col md:w-[390px] lg:w-[420px] flex-shrink-0'
    : 'hidden md:flex md:w-[390px] lg:w-[420px] flex-shrink-0 h-full';

  const mapContainerClass = isDrivingMode
    ? 'flex-1 relative w-full h-full overflow-hidden'
    : mobileTab === 'map'
    ? 'flex-1 relative w-full h-full overflow-hidden'
    : 'hidden md:flex flex-1 relative w-full h-full overflow-hidden';

  if (mapProvider === 'here') {
    return (
      <HereMapsProvider>
        <div className="flex h-screen h-[100dvh] w-screen overflow-hidden bg-gray-100 relative">
          <div className={sidebarContainerClass}>
            {sidebarEl}
          </div>
          <div className={mapContainerClass}>
            <ErrorBoundary>
              <HereMapView
                waypoints={waypoints}
                tripPlan={tripPlan}
                selectedDay={isDrivingMode ? drivingDayIndex : selectedDay}
                onAddWaypoint={addWaypoint}
                onSetStart={handleSetStart}
                onOpenUpdateTripModal={() => setIsUpdateTripModalOpen(true)}
                isDrivingMode={isDrivingMode}
                drivingPosition={drivingPosition}
                autoFollow={autoFollow}
                onMapUserDrag={handleMapUserDrag}
                focusedPlace={focusedDrivingPlace}
              />
            </ErrorBoundary>
            {mobileMapControls}
            {drivingHudEl}
          </div>
          {updateModalEl}
        </div>
      </HereMapsProvider>
    );
  }

  return (
    <GoogleMapsProvider>
      <div className="flex h-screen h-[100dvh] w-screen overflow-hidden bg-gray-100 relative">
        <div className={sidebarContainerClass}>
          {sidebarEl}
        </div>
        <div className={mapContainerClass}>
          <ErrorBoundary>
            <MapView
              waypoints={waypoints}
              tripPlan={tripPlan}
              selectedDay={isDrivingMode ? drivingDayIndex : selectedDay}
              onAddWaypoint={addWaypoint}
              onSetStart={handleSetStart}
              onOpenUpdateTripModal={() => setIsUpdateTripModalOpen(true)}
              isDrivingMode={isDrivingMode}
              drivingPosition={drivingPosition}
              autoFollow={autoFollow}
              onMapUserDrag={handleMapUserDrag}
              focusedPlace={focusedDrivingPlace}
            />
          </ErrorBoundary>
          {mobileMapControls}
          {drivingHudEl}
        </div>
        {updateModalEl}
      </div>
    </GoogleMapsProvider>
  );
}
