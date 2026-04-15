'use client';

import { Waypoint } from '@/lib/types';
import PlaceAutocomplete from './PlaceAutocomplete';

interface WaypointListProps {
  waypoints: Waypoint[];
  onAdd: (waypoint: Waypoint) => void;
  onRemove: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  disabled?: boolean;
}

export default function WaypointList({
  waypoints,
  onAdd,
  onRemove,
  onReorder,
  disabled = false,
}: WaypointListProps) {
  const moveUp = (index: number) => {
    if (index > 1) onReorder(index, index - 1); // Don't move above origin
  };

  const moveDown = (index: number) => {
    if (index < waypoints.length - 1) onReorder(index, index + 1);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Stops
        </h3>
        <span className="text-xs text-gray-400">{waypoints.length} places</span>
      </div>

      {/* Waypoint list */}
      <div className="space-y-2">
        {waypoints.map((wp, index) => (
          <div
            key={wp.id}
            className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg group hover:bg-gray-100 transition-colors"
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
              <p className="text-sm font-medium text-gray-800 truncate">
                {wp.name}
              </p>
              <p className="text-xs text-gray-500 truncate">{wp.address}</p>
            </div>

            {/* Actions */}
            <div className="flex-shrink-0 flex items-center gap-1">
              {index > 1 && (
                <button
                  onClick={() => moveUp(index)}
                  disabled={disabled}
                  className="p-1 text-gray-400 hover:text-gray-600"
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
                  className="p-1 text-gray-400 hover:text-gray-600"
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

      {/* Add waypoint input */}
      <div>
        <PlaceAutocomplete
          onPlaceSelect={onAdd}
          placeholder={
            waypoints.length === 0
              ? '🏠 Add your starting point (you will return here)...'
              : '📍 Add a destination to visit...'
          }
          disabled={disabled}
        />
      </div>

      {waypoints.length >= 1 && (
        <p className="text-xs text-gray-400 text-center">
          📍 Route: {waypoints[0]?.name} → {waypoints.slice(1).map(w => w.name).join(' → ')}{waypoints.length > 1 ? ` → ${waypoints[0]?.name}` : ''}
          {' '}(order will be optimised)
        </p>
      )}

      {waypoints.length < 2 && (
        <p className="text-xs text-gray-400 text-center">
          Add at least 2 places to plan your trip
        </p>
      )}
    </div>
  );
}
