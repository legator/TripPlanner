import { NextRequest, NextResponse } from 'next/server';
import { planTrip } from '@/lib/tripPlanner';
import { PlanTripRequest } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body: PlanTripRequest = await request.json();
    const { waypoints, settings } = body;

    // Validation
    if (!waypoints || waypoints.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 waypoints are required' },
        { status: 400 }
      );
    }

    if (!settings) {
      return NextResponse.json(
        { error: 'Trip settings are required' },
        { status: 400 }
      );
    }

    const apiKey =
      process.env.GOOGLE_MAPS_API_KEY ||
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!apiKey || apiKey === 'your_google_maps_api_key_here') {
      return NextResponse.json(
        { error: 'Google Maps API key is not configured on the server' },
        { status: 500 }
      );
    }

    // Plan the trip
    const tripPlan = await planTrip(waypoints, settings);

    return NextResponse.json(tripPlan);
  } catch (error) {
    console.error('Trip planning error:', error);

    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred';

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
