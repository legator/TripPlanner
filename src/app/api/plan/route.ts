import { NextRequest, NextResponse } from 'next/server';
import { planTrip } from '@/lib/tripPlanner';
import { PlanTripRequestWithProvider } from '@/lib/types';
import { validateWaypoints, validateAndClampSettings } from '@/lib/validation';
import { getRedisClient } from '@/lib/redisClient';
import { checkAndIncrementUserPlanQuota, UserQuotaExceededError } from '@/lib/quota/userQuotaGuard';

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

const localRateLimitMap = new Map<string, { count: number; resetAt: number }>();

function cleanupLocal() {
  const now = Date.now();
  localRateLimitMap.forEach((v, k) => {
    if (v.resetAt <= now) localRateLimitMap.delete(k);
  });
}

function isLocalRateLimited(ip: string): boolean {
  cleanupLocal();
  const now = Date.now();
  const entry = localRateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    localRateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  if (entry.count >= RATE_LIMIT) return true;
  entry.count++;
  return false;
}

async function isRateLimited(ip: string): Promise<boolean> {
  const redis = await getRedisClient();
  if (redis) {
    try {
      const key = `rl:plan:${ip}`;
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, Math.ceil(RATE_WINDOW_MS / 1000));
      return count > RATE_LIMIT;
    } catch (err) {
      console.warn('Rate limit Redis error, falling back to local:', err);
    }
  }
  return isLocalRateLimited(ip);
}

function getClientIP(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);
  if (await isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a minute before planning another trip.' },
      { status: 429 }
    );
  }

  try {
    const clientId = request.headers.get('x-client-id') || 'anonymous';
    const customGoogleKey = request.headers.get('x-custom-google-key') || undefined;
    const customHereKey = request.headers.get('x-custom-here-key') || undefined;

    const body: PlanTripRequestWithProvider = await request.json();

    const waypointError = validateWaypoints(body?.waypoints);
    if (waypointError) {
      return NextResponse.json({ error: waypointError }, { status: 400 });
    }

    const { settings, error: settingsError } = validateAndClampSettings(body?.settings);
    if (settingsError) {
      return NextResponse.json({ error: settingsError }, { status: 400 });
    }

    const requestedProvider = body?.provider;
    const envProvider = process.env.MAP_PROVIDER || process.env.NEXT_PUBLIC_MAP_PROVIDER;
    const provider = requestedProvider ?? (envProvider === 'here' ? 'here' : 'google');

    const activeCustomKey = provider === 'google' ? customGoogleKey : customHereKey;
    const hasCustomKey = Boolean(activeCustomKey && activeCustomKey.trim().length > 5);

    // Enforce per-user quota (BYOK users bypass and are not deducted)
    let userQuotaStatus;
    try {
      userQuotaStatus = await checkAndIncrementUserPlanQuota(clientId, hasCustomKey);
    } catch (quotaError) {
      if (quotaError instanceof UserQuotaExceededError) {
        return NextResponse.json(
          {
            error: quotaError.message,
            code: quotaError.code,
            quota: quotaError.status,
            allowBYOK: true,
          },
          { status: 429 }
        );
      }
      throw quotaError;
    }

    // Validate that a key is available (either custom or server default)
    if (provider === 'google' && !hasCustomKey) {
      const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      if (!apiKey || apiKey === 'your_google_maps_api_key_here') {
        return NextResponse.json(
          { error: 'Google Maps API key is not configured on the server. You can provide your own key in Settings.' },
          { status: 500 }
        );
      }
    } else if (provider === 'here' && !hasCustomKey) {
      const hereKey = process.env.HERE_API_KEY || process.env.NEXT_PUBLIC_HERE_API_KEY;
      if (!hereKey || hereKey === 'your_here_api_key_here') {
        return NextResponse.json(
          { error: 'HERE Maps API key is not configured on the server. You can provide your own key in Settings.' },
          { status: 500 }
        );
      }
    }

    const tripPlan = await planTrip(body.waypoints, settings, provider, activeCustomKey);

    const headers: Record<string, string> = {
      'x-quota-tier': userQuotaStatus.tier,
      'x-quota-monthly-used': String(userQuotaStatus.monthly.used),
      'x-quota-monthly-remaining': String(userQuotaStatus.monthly.remaining),
      'x-quota-daily-used': String(userQuotaStatus.daily.used),
    };

    return NextResponse.json(tripPlan, { headers });
  } catch (error) {
    console.error('Trip planning error:', error);

    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    const isRateLimit =
      /rate limit|quota|exceeded|too many requests|over_query_limit|resource_exhausted/i.test(message);

    return NextResponse.json(
      { error: message, code: isRateLimit ? 'RATE_LIMIT_EXCEEDED' : 'PLAN_ERROR' },
      { status: isRateLimit ? 429 : 500 }
    );
  }
}
