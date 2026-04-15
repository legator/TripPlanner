'use client';

import { useState, useCallback, useRef } from 'react';
import { GoogleMapsProvider } from '@/components/GoogleMapsProvider';
import MapView from '@/components/MapView';
import Sidebar from '@/components/Sidebar';
import { Waypoint, TripPlan, TripSettings } from '@/lib/types';
import { DEFAULT_SETTINGS } from '@/lib/constants';
import { toggleRestDay, setDayEndAtSegment, applyUserEdits, applyOptimizedSegments, emptyUserEdits } from '@/lib/tripPlanEditor';
import { optimizeDayRoute } from '@/lib/tripOptimization';
import type { UserEdits } from '@/lib/tripPlanEditor';

export default function Home() {
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [settings, setSettings] = useState<TripSettings>(DEFAULT_SETTINGS);
  const [tripPlan, setTripPlan] = useState<TripPlan | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // Accumulated waypoints used for the active plan (includes search-added stops)
  const planWaypointsRef = useRef<Waypoint[]>([]);
  // Track user edits (rest days, day-end choices) so they survive re-plans
  const userEditsRef = useRef<UserEdits>(emptyUserEdits());

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

  return (
    <GoogleMapsProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-gray-100">
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
        />
        <MapView
          waypoints={waypoints}
          tripPlan={tripPlan}
          selectedDay={selectedDay}
          onAddWaypoint={(wp) => setWaypoints((prev) => [...prev, wp])}
        />
      </div>
    </GoogleMapsProvider>
  );
}
