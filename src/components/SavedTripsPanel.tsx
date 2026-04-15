'use client';

import { useState, useEffect } from 'react';
import { listSavedTrips, saveTrip, deleteTrip, SavedTrip } from '@/lib/savedTrips';
import { TripPlan, TripSettings, Waypoint } from '@/lib/types';

interface SavedTripsPanelProps {
  waypoints: Waypoint[];
  settings: TripSettings;
  tripPlan: TripPlan | null;
  onLoadTrip: (trip: SavedTrip) => void;
}

function formatRelativeTime(isoDate: string): string {
  const ms = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function SavedTripsPanel({
  waypoints,
  settings,
  tripPlan,
  onLoadTrip,
}: SavedTripsPanelProps) {
  const [trips, setTrips] = useState<SavedTrip[]>([]);
  const [saveName, setSaveName] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    setTrips(listSavedTrips());
  }, []);

  const defaultName = () => {
    const places = waypoints.map((w) => w.name.split(',')[0]).join(' → ');
    return places || 'My Trip';
  };

  const handleSave = () => {
    const name = saveName.trim() || defaultName();
    saveTrip(name, waypoints, settings, tripPlan);
    setTrips(listSavedTrips());
    setSaveName('');
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  const handleDelete = (id: string) => {
    deleteTrip(id);
    setTrips(listSavedTrips());
    setConfirmDelete(null);
  };

  return (
    <div className="space-y-3">
      {/* Save current trip */}
      <div className="flex gap-2">
        <input
          type="text"
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          placeholder={defaultName()}
          className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        />
        <button
          onClick={handleSave}
          className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex-shrink-0"
        >
          {saveStatus === 'saved' ? '✓ Saved' : 'Save'}
        </button>
      </div>

      {/* Saved list */}
      {trips.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">
          No saved trips yet
        </p>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {trips.map((trip) => (
            <div
              key={trip.id}
              className="flex items-center gap-2 p-2.5 rounded-lg border border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-600 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 dark:text-white truncate">{trip.name}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {trip.waypoints.length} stops · {formatRelativeTime(trip.savedAt)}
                  {trip.tripPlan && ` · ${trip.tripPlan.totalDays} days`}
                </p>
              </div>
              <button
                onClick={() => onLoadTrip(trip)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0 px-1"
              >
                Load
              </button>
              {confirmDelete === trip.id ? (
                <div className="flex gap-1">
                  <button
                    onClick={() => handleDelete(trip.id)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="text-xs text-gray-400 hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(trip.id)}
                  className="text-xs text-gray-300 dark:text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
