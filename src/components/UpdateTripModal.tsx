'use client';

import { useState, useEffect, useCallback } from 'react';
import { Waypoint, TripPlan } from '@/lib/types';
import { getCurrentLocationWaypoint } from '@/lib/location';
import type { MapProviderChoice } from './MapProviderPicker';

export type TripUpdateMode = 'resume_trip' | 'update_origin' | 'start_day';

interface UpdateTripModalProps {
  isOpen: boolean;
  onClose: () => void;
  tripPlan: TripPlan;
  waypoints: Waypoint[];
  mapProvider?: MapProviderChoice;
  selectedDay: number | null;
  onConfirmUpdate: (params: {
    mode: TripUpdateMode;
    currentLocation: Waypoint;
    selectedStopIds?: string[];
    dayIndex?: number;
  }) => Promise<void>;
}

export default function UpdateTripModal({
  isOpen,
  onClose,
  tripPlan,
  waypoints,
  mapProvider,
  selectedDay,
  onConfirmUpdate,
}: UpdateTripModalProps) {
  const [currentLocation, setCurrentLocation] = useState<Waypoint | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const [mode, setMode] = useState<TripUpdateMode>('resume_trip');
  const [targetDayIndex, setTargetDayIndex] = useState<number>(selectedDay ?? 0);

  // For resume mode: which destinations to keep (defaults to all destinations, excluding origin)
  const destinationWaypoints = waypoints.slice(1);
  const [selectedDestinationIds, setSelectedDestinationIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fetchLocation = useCallback(async () => {
    setIsLocating(true);
    setLocationError(null);
    try {
      const wp = await getCurrentLocationWaypoint(mapProvider || undefined, 'My Current Location');
      setCurrentLocation(wp);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to determine your location';
      setLocationError(msg);
    } finally {
      setIsLocating(false);
    }
  }, [mapProvider]);

  // When modal opens, fetch location and initialize selected destinations
  useEffect(() => {
    if (isOpen) {
      fetchLocation();
      setSelectedDestinationIds(destinationWaypoints.map((w) => w.id));
      setTargetDayIndex(selectedDay !== null ? selectedDay : 0);
      setSubmitError(null);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const toggleDestination = (id: string) => {
    setSelectedDestinationIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleConfirm = async () => {
    if (!currentLocation) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await onConfirmUpdate({
        mode,
        currentLocation,
        selectedStopIds: mode === 'resume_trip' ? selectedDestinationIds : undefined,
        dayIndex: mode === 'start_day' ? targetDayIndex : undefined,
      });
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to update trip');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🧭</span>
            <div>
              <h3 className="font-bold text-base">Update Trip from Current Location</h3>
              <p className="text-xs text-blue-100">Re-route based on where you are right now</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 custom-scrollbar flex-1">
          {/* Current Location Box */}
          <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
                </span>
                GPS Position Detected
              </span>
              <button
                type="button"
                onClick={fetchLocation}
                disabled={isLocating}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 disabled:opacity-50"
              >
                🔄 Refresh
              </button>
            </div>

            {isLocating && (
              <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 py-1">
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span>Reading GPS &amp; reverse geocoding address...</span>
              </div>
            )}

            {locationError && (
              <div className="p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-xs text-red-600 dark:text-red-300">
                <p className="font-medium">Location Error:</p>
                <p>{locationError}</p>
              </div>
            )}

            {currentLocation && !isLocating && (
              <div className="space-y-1">
                <p className="text-sm font-bold text-gray-900 dark:text-white">
                  {currentLocation.name}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-300">{currentLocation.address}</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 font-mono">
                  {currentLocation.location.lat.toFixed(5)}, {currentLocation.location.lng.toFixed(5)}
                </p>
              </div>
            )}
          </div>

          {/* Mode Selection */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
              How would you like to update your trip?
            </label>

            <div className="space-y-2">
              {/* Mode 1: Resume trip */}
              <label
                className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                  mode === 'resume_trip'
                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'
                }`}
              >
                <input
                  type="radio"
                  name="trip_update_mode"
                  value="resume_trip"
                  checked={mode === 'resume_trip'}
                  onChange={() => setMode('resume_trip')}
                  className="mt-1 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-gray-800 dark:text-white">
                      Resume trip from current location
                    </span>
                    <span className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/60 dark:text-green-300 font-bold px-1.5 py-0.5 rounded">
                      Recommended
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Start from your actual position and re-route remaining upcoming destinations.
                  </p>
                </div>
              </label>

              {/* Mode 2: Update Trip Origin */}
              <label
                className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                  mode === 'update_origin'
                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'
                }`}
              >
                <input
                  type="radio"
                  name="trip_update_mode"
                  value="update_origin"
                  checked={mode === 'update_origin'}
                  onChange={() => setMode('update_origin')}
                  className="mt-1 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <span className="font-semibold text-sm text-gray-800 dark:text-white">
                    Replace trip starting origin
                  </span>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Changes the trip&apos;s initial starting place to current location and keeps all original destinations.
                  </p>
                </div>
              </label>

              {/* Mode 3: Start Day N */}
              <label
                className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                  mode === 'start_day'
                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'
                }`}
              >
                <input
                  type="radio"
                  name="trip_update_mode"
                  value="start_day"
                  checked={mode === 'start_day'}
                  onChange={() => setMode('start_day')}
                  className="mt-1 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <span className="font-semibold text-sm text-gray-800 dark:text-white">
                    Start a specific day from current location
                  </span>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Update the morning departure point for a chosen day.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Additional controls depending on mode */}
          {mode === 'resume_trip' && destinationWaypoints.length > 0 && (
            <div className="space-y-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600">
              <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block">
                Select remaining destinations to visit:
              </label>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Uncheck any stops you have already visited or want to skip.
              </p>
              <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar pt-1">
                {destinationWaypoints.map((wp) => (
                  <label
                    key={wp.id}
                    className="flex items-center gap-2 p-1.5 hover:bg-white dark:hover:bg-gray-600 rounded-lg cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedDestinationIds.includes(wp.id)}
                      onChange={() => toggleDestination(wp.id)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs font-medium text-gray-800 dark:text-white truncate">
                      {wp.name}
                    </span>
                    <span className="text-[10px] text-gray-400 truncate ml-auto max-w-[140px]">
                      {wp.address}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {mode === 'start_day' && (
            <div className="space-y-1.5 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600">
              <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block">
                Choose day to update:
              </label>
              <select
                value={targetDayIndex}
                onChange={(e) => setTargetDayIndex(parseInt(e.target.value, 10))}
                className="w-full text-xs p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-white"
              >
                {tripPlan.days.map((day, idx) => (
                  <option key={idx} value={idx}>
                    Day {day.dayNumber} ({day.date}) — {day.startLocation.name.split(',')[0]} → {day.endLocation.name.split(',')[0]}
                  </option>
                ))}
              </select>
            </div>
          )}

          {submitError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-xs text-red-600 dark:text-red-300">
              {submitError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/70 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!currentLocation || isSubmitting || isLocating}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-xl flex items-center gap-2 shadow-sm transition-all"
          >
            {isSubmitting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Re-planning trip...</span>
              </>
            ) : (
              <>
                <span>Update Trip Route</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
