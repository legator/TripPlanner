'use client';

import { TripPlan, TripSettings, Waypoint } from './types';

const SAVED_TRIPS_KEY = 'tripplanner_saved_trips';
const MAX_SAVED_TRIPS = 20;

export interface SavedTrip {
  id: string;
  name: string;
  savedAt: string;
  waypoints: Waypoint[];
  settings: TripSettings;
  tripPlan: TripPlan | null;
}

function loadAll(): SavedTrip[] {
  try {
    const raw = localStorage.getItem(SAVED_TRIPS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedTrip[];
  } catch {
    return [];
  }
}

function saveAll(trips: SavedTrip[]): void {
  try {
    localStorage.setItem(SAVED_TRIPS_KEY, JSON.stringify(trips));
  } catch {
    // Storage full — remove oldest
    const trimmed = trips.slice(-MAX_SAVED_TRIPS + 1);
    try {
      localStorage.setItem(SAVED_TRIPS_KEY, JSON.stringify(trimmed));
    } catch {
      // ignore
    }
  }
}

export function listSavedTrips(): SavedTrip[] {
  return loadAll().sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
  );
}

export function saveTrip(
  name: string,
  waypoints: Waypoint[],
  settings: TripSettings,
  tripPlan: TripPlan | null,
  existingId?: string
): SavedTrip {
  const trips = loadAll();
  const id = existingId ?? crypto.randomUUID();
  const trip: SavedTrip = {
    id,
    name,
    savedAt: new Date().toISOString(),
    waypoints,
    settings,
    tripPlan,
  };

  const idx = trips.findIndex((t) => t.id === id);
  if (idx >= 0) {
    trips[idx] = trip;
  } else {
    trips.push(trip);
    // Keep only the most recent MAX_SAVED_TRIPS
    if (trips.length > MAX_SAVED_TRIPS) trips.splice(0, trips.length - MAX_SAVED_TRIPS);
  }

  saveAll(trips);
  return trip;
}

export function deleteTrip(id: string): void {
  const trips = loadAll().filter((t) => t.id !== id);
  saveAll(trips);
}

export function loadTrip(id: string): SavedTrip | null {
  return loadAll().find((t) => t.id === id) ?? null;
}
