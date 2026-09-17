'use client';

import { Waypoint, TripSettings, TripPlan } from './types';
import { recordApiCall } from './apiTracker';
import { MapProviderChoice } from '@/components/MapProviderPicker';

export async function planTripRequest(
  waypoints: Waypoint[],
  settings: TripSettings,
  provider: MapProviderChoice | null | undefined
): Promise<TripPlan> {
  const response = await fetch('/api/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ waypoints, settings, provider }),
  });

  const data = await response.json();
  recordApiCall(provider === 'here' ? 'here' : 'google', response.ok, response.status, data.error);

  if (!response.ok) {
    throw new Error(data.error || 'Failed to plan trip');
  }

  return data as TripPlan;
}
