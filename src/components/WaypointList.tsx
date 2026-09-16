'use client';

import { useState } from 'react';
import { Waypoint } from '@/lib/types';
import PlaceSearch from './PlaceSearch';
import type { MapProviderChoice } from './MapProviderPicker';
import { getCurrentLocationWaypoint } from '@/lib/location';

interface WaypointListProps {
  waypoints: Waypoint[];
  onAdd: (waypoint: Waypoint) => void;
  onRemove: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onSetStart?: (waypoint: Waypoint) => void;
  disabled?: boolean;
  oneWayTrip?: boolean;
  supportsOptimization?: boolean;
  currentMapProvider?: MapProviderChoice;
}

export default function WaypointList({
  waypoints,
  onAdd,
  onRemove,
  onReorder,
  onSetStart,
  disabled = false,
  oneWayTrip = false,
  supportsOptimization = false,
  currentMapProvider,
}: WaypointListProps) {
  const [isLocatingStart, setIsLocatingStart] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const moveUp = (index: number) => {
    if (index > 1) onReorder(index, index - 1); // Don't move above origin
  };

  const moveDown = (index: number) => {
    if (index < waypoints.length - 1) onReorder(index, index + 1);
  };

  const handleUseCurrentLocationAsStart = async () => {
    setIsLocatingStart(true);
    setLocationError(null);
    try {
      const wp = await getCurrentLocationWaypoint(currentMapProvider || undefined, 'Start (My Location)');
      if (waypoints.length === 0) {
        onAdd(wp);
      } else if (onSetStart) {
        onSetStart(wp);
      } else {
        // Fallback: replace index 0
        const updated = [...waypoints];
        updated[0] = wp;
        // In case onSetStart wasn't passed, callers can still benefit if reorder/add handles it
        onAdd(wp);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to obtain your location';
      setLocationError(msg);
      setTimeout(() => setLocationError(null), 6000);
    } finally {
      setIsLocatingStart(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
          Stops
        </h3>
        <span className="text-xs text-gray-400 dark:text-gray-500">{waypoints.length} places</span>
      </div>

      {/* Empty State with Current Location button */}
      {waypoints.length === 0 && (
        <div className="p-3 bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl space-y-2.5 text-center">
          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 flex items-center justify-center mx-auto">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="3" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v3m0 14v3m10-10h-3M5 12H2" />
            </svg>
          </div>
          <div>
            <p className="text-xs font-semibold text-blue-900 dark:text-blue-200">
              Start from your current location
            </p>
            <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-0.5">
              We&apos;ll request permission to read your GPS coordinates as the trip origin
            </p>
          </div>
          <button
            type="button"
            onClick={handleUseCurrentLocationAsStart}
            disabled={disabled || isLocatingStart}
            className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg flex items-center justify-center gap-2 shadow-sm transition-colors disabled:opacity-50"
          >
            {isLocatingStart ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Acquiring location...</span>
              </>
            ) : (
              <>
                <span>📍 Set Start to My Location</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Location error message */}
      {locationError && (
        <div className="p-2.5 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
          <p className="text-xs text-red-600 dark:text-red-300">{locationError}</p>
        </div>
      )}

      {/* Waypoint list */}
      {waypoints.length > 0 && (
        <div className="space-y-2">
          {waypoints.map((wp, index) => (
            <div
              key={wp.id}
              className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg group hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
            >
              {/* Index indicator */}
              <div
                className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                  index === 0 ? 'bg-green-500' : 'bg-primary-500'
                }`}
                title={index === 0 ? 'Start & finish' : `Stop ${index}`}
              >
                {index === 0 ? '🏠' : String.fromCharCode(65 + Math.min(index - 1, 25))}
              </div>

              {/* Place info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-gray-800 dark:text-white truncate">
                    {wp.name}
                  </p>
                  {index === 0 && (
                    <span className="text-[10px] uppercase font-bold text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/50 px-1.5 py-0.2 rounded">
                      Origin
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{wp.address}</p>
              </div>

              {/* Actions */}
              <div className="flex-shrink-0 flex items-center gap-1">
                {index === 0 && (
                  <button
                    onClick={handleUseCurrentLocationAsStart}
                    disabled={disabled || isLocatingStart}
                    className="p-1 text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition-colors"
                    title="Update start to current GPS location"
                  >
                    {isLocatingStart ? (
                      <div className="w-3.5 h-3.5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <circle cx="12" cy="12" r="3" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v3m0 14v3m10-10h-3M5 12H2" />
                      </svg>
                    )}
                  </button>
                )}

                {index > 1 && (
                  <button
                    onClick={() => moveUp(index)}
                    disabled={disabled}
                    className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                    title="Move up"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                )}
                {index > 0 && index < waypoints.length - 1 && (
                  <button
                    onClick={() => moveDown(index)}
                    disabled={disabled}
                    className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                    title="Move down"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                )}
                {index > 0 && (
                  <button
                    onClick={() => onRemove(wp.id)}
                    disabled={disabled}
                    className="p-1 text-gray-400 hover:text-red-500"
                    title="Remove"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add waypoint input */}
      <div>
        <PlaceSearch
          onPlaceSelect={onAdd}
          placeholder={
            waypoints.length === 0
              ? '🏠 Add your starting point (you will return here)...'
              : '📍 Add a destination to visit...'
          }
          disabled={disabled}
          currentMapProvider={currentMapProvider}
        />
      </div>

      {waypoints.length >= 1 && (() => {
        const origin = waypoints[0]?.name;
        const dests = waypoints.slice(1).map((w) => w.name).join(' → ');
        const roundTrip = !oneWayTrip && waypoints.length > 1 ? ` → ${origin}` : '';
        const optimizationNote = supportsOptimization ? ' (order will be optimised)' : '';
        return (
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
            📍 Route: {origin} → {dests}{roundTrip}{optimizationNote}
          </p>
        );
      })()}

      {waypoints.length < 2 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
          Add at least 2 places to plan your trip
        </p>
      )}
    </div>
  );
}
