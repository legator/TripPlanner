import { DayPlan, DaySegment, TripSettings } from './types';

/**
 * Optimize the route for a specific day using the server-side route optimization API.
 * Keeps server-only provider dependencies (HERE/Google SDKs, Redis quotas) off the client bundle.
 * Returns optimized segments in the best order.
 */
export async function optimizeDayRoute(
  day: DayPlan,
  settings: TripSettings,
  provider: 'google' | 'here' = 'google'
): Promise<DaySegment[]> {
  if (day.isRestDay || !day.segments || day.segments.length <= 1) {
    return day.segments;
  }

  try {
    const response = await fetch('/api/route/optimize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        day,
        settings,
        provider,
      }),
    });

    if (!response.ok) {
      console.warn('[optimizeDayRoute] Server error:', response.statusText);
      return day.segments;
    }

    const data = await response.json();
    return data.segments || day.segments;
  } catch (error) {
    console.warn('[optimizeDayRoute] Network error during optimization:', error);
    return day.segments;
  }
}
