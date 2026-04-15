'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleMapsProvider } from '@/components/GoogleMapsProvider';
import MapView from '@/components/MapView';
import { HereMapsProvider } from '@/components/HereMapsProvider';
import HereMapView from '@/components/HereMapView';
import MapProviderPicker, { getStoredMapProvider, storeMapProvider, MapProviderChoice } from '@/components/MapProviderPicker';
import Sidebar from '@/components/Sidebar';
import ErrorBoundary from '@/components/ErrorBoundary';
import { Waypoint, TripPlan, TripSettings } from '@/lib/types';
import { DEFAULT_SETTINGS } from '@/lib/constants';
import { toggleRestDay, setDayEndAtSegment, applyUserEdits, applyOptimizedSegments, emptyUserEdits } from '@/lib/tripPlanEditor';
import { optimizeDayRoute } from '@/lib/tripOptimization';
import { saveTripToStorage, loadTripFromStorage, clearTripFromStorage } from '@/lib/tripStorage';
import { decodeTripFromURL, loadTripFromShareParam } from '@/lib/tripShare';
import type { UserEdits } from '@/lib/tripPlanEditor';
import type { SavedTrip } from '@/lib/savedTrips';

export default function Home() {
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [settings, setSettings] = useState<TripSettings>(DEFAULT_SETTINGS);
  const [tripPlan, setTripPlan] = useState<TripPlan | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  // null = not yet determined (loading from localStorage), undefined = show picker
  const [mapProvider, setMapProvider] = useState<MapProviderChoice | null | undefined>(null);

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
        body: JSON.stringify({ waypoints, settings }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to plan trip');
      }

      setTripPlan(data);
      setSelectedDay(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'An unexpected error occurred'
      );
    } finally {
      setIsPlanning(false);
    }
  }, [waypoints, settings]);

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
        ? setDayEndAtSegment(prev, dayIndex, segmentCount, settings.checkoutTime, settings.checkinTime)
        : prev
    );
  }, [settings.checkoutTime, settings.checkinTime]);

  const handleOptimizeRoute = useCallback(async (dayIndex: number) => {
    if (!tripPlan) return;

    setIsPlanning(true);
    setError(null);

    try {
      const day = tripPlan.days[dayIndex];
      const optimizedSegments = await optimizeDayRoute(day, settings);

      setTripPlan((prev) =>
        prev
          ? applyOptimizedSegments(prev, dayIndex, optimizedSegments, settings.checkoutTime, settings.checkinTime)
          : prev
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to optimize route');
    } finally {
      setIsPlanning(false);
    }
  }, [tripPlan, settings]);

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
        body: JSON.stringify({ waypoints: currentPlanWaypoints, settings }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to re-plan trip');

      // Re-apply user edits (rest days, day-end choices) on the fresh plan
      const finalPlan = applyUserEdits(
        data,
        userEditsRef.current,
        settings.checkoutTime,
        settings.checkinTime
      );
      setTripPlan(finalPlan);
      setSelectedDay(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsPlanning(false);
    }
  }, [settings]);

  const addWaypoint = (wp: Waypoint) => setWaypoints((prev) => [...prev, wp]);

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
        mapProvider={mapProvider ?? undefined}
        onChangeMapProvider={() => setMapProvider(undefined)}
        onLoadSavedTrip={handleLoadSavedTrip}
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

  if (mapProvider === 'here') {
    return (
      <HereMapsProvider>
        <div className="flex h-screen w-screen overflow-hidden bg-gray-100">
          {sidebarEl}
          <ErrorBoundary>
            <HereMapView
              waypoints={waypoints}
              tripPlan={tripPlan}
              selectedDay={selectedDay}
              onAddWaypoint={addWaypoint}
            />
          </ErrorBoundary>
        </div>
      </HereMapsProvider>
    );
  }

  return (
    <GoogleMapsProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-gray-100">
        {sidebarEl}
        <ErrorBoundary>
          <MapView
            waypoints={waypoints}
            tripPlan={tripPlan}
            selectedDay={selectedDay}
            onAddWaypoint={addWaypoint}
          />
        </ErrorBoundary>
      </div>
    </GoogleMapsProvider>
  );
}
