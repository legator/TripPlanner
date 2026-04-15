import { NextRequest, NextResponse } from 'next/server';
import { planTrip } from '@/lib/tripPlanner';
import { PlanTripRequest } from '@/lib/types';

// ─── Simple in-memory rate limiter ──────────────────────────────────────────
// Limits each IP to 10 planning requests per minute.
// Note: in a multi-instance deployment use Redis or an edge KV store instead.

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

function getClientIP(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }

  if (entry.count >= RATE_LIMIT) return true;

  entry.count++;
  return false;
}
// ────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a minute before planning another trip.' },
      { status: 429 }
    );
  }

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
