'use client';

import { Waypoint, TripSettings, TripPlan } from './types';
import { recordApiCall } from './apiTracker';
import { MapProviderChoice } from '@/components/MapProviderPicker';
import { getApiAuthHeaders } from './userKeys';

export async function planTripRequest(
  waypoints: Waypoint[],
  settings: TripSettings,
  provider: MapProviderChoice | null | undefined
): Promise<TripPlan> {
  const authHeaders = getApiAuthHeaders();

  const response = await fetch('/api/plan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify({ waypoints, settings, provider }),
  });

  const data = await response.json();
  recordApiCall(provider === 'here' ? 'here' : 'google', response.ok, response.status, data.error);

  if (!response.ok) {
    const errorObj = new Error(data.error || 'Failed to plan trip');
    // Attach error code if quota exceeded
    if (data.code === 'USER_QUOTA_EXCEEDED') {
      (errorObj as unknown as { code?: string; allowBYOK?: boolean }).code = 'USER_QUOTA_EXCEEDED';
      (errorObj as unknown as { code?: string; allowBYOK?: boolean }).allowBYOK = true;
    }
    throw errorObj;
  }

  return data as TripPlan;
}
