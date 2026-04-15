'use client';

import { TripPlan, TripSettings, Waypoint } from './types';

const STORAGE_KEY = 'tripplanner_saved';

export interface SavedTripState {
  waypoints: Waypoint[];
  settings: TripSettings;
  tripPlan: TripPlan | null;
  savedAt: string;
}

export function saveTripToStorage(
  waypoints: Waypoint[],
  settings: TripSettings,
  tripPlan: TripPlan | null
): void {
  try {
    const state: SavedTripState = {
      waypoints,
      settings,
      tripPlan,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // LocalStorage may be unavailable (private mode, storage full, etc.)
  }
}

export function loadTripFromStorage(): SavedTripState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedTripState;
  } catch {
    return null;
  }
}

export function clearTripFromStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
