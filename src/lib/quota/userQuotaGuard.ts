/**
 * Per-User Quota Engine & BYOK Metering
 *
 * Enforces personal allowances on the shared free tier:
 * - Monthly trip planning allowance (default: 15 plans / month)
 * - Daily trip planning safety limit (default: 5 plans / day)
 * - BYOK bypass: users providing their own API key have unlimited usage.
 *
 * Uses Upstash Redis for distributed atomic metering with in-memory fallback.
 */

import { getRedisClient } from '../redisClient';

export interface UserQuotaUsage {
  used: number;
  limit: number;
  remaining: number;
  resetDate?: string;
}

export interface UserQuotaStatus {
  clientId: string;
  tier: 'free' | 'byok';
  isExceeded: boolean;
  reason?: 'daily_limit' | 'monthly_limit';
  monthly: UserQuotaUsage;
  daily: UserQuotaUsage;
  hasCustomGoogleKey: boolean;
  hasCustomHereKey: boolean;
}

export class UserQuotaExceededError extends Error {
  code = 'USER_QUOTA_EXCEEDED';
  statusCode = 429;
  status: UserQuotaStatus;

  constructor(message: string, status: UserQuotaStatus) {
    super(message);
    this.name = 'UserQuotaExceededError';
    this.status = status;
  }
}

export const FREE_USER_MONTHLY_PLAN_LIMIT = Number(process.env.FREE_USER_MONTHLY_PLAN_LIMIT) || 15;
export const FREE_USER_DAILY_PLAN_LIMIT = Number(process.env.FREE_USER_DAILY_PLAN_LIMIT) || 5;

const MONTH_TTL_SECONDS = 60 * 60 * 24 * 35; // 35 days
const DAY_TTL_SECONDS = 60 * 60 * 24 * 2;    // 2 days

// ─── Local fallback store ───────────────────────────────────────────────────

const globalForUserQuota = globalThis as unknown as {
  userQuotaStore?: Record<string, number>;
};

const localUserQuotaStore: Record<string, number> =
  globalForUserQuota.userQuotaStore || (globalForUserQuota.userQuotaStore = {});

function getCurrentMonthKey(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getCurrentDayKey(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getNextMonthResetDate(): string {
  const d = new Date();
  const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const year = nextMonth.getFullYear();
  const month = String(nextMonth.getMonth() + 1).padStart(2, '0');
  const day = String(nextMonth.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Checks and returns the current quota status for a user without modifying counters.
 */
export async function getUserQuotaStatus(
  clientId: string,
  customGoogleKey?: string,
  customHereKey?: string
): Promise<UserQuotaStatus> {
  const cleanId = clientId || 'anonymous';
  const hasCustomGoogle = Boolean(customGoogleKey && customGoogleKey.trim().length > 5);
  const hasCustomHere = Boolean(customHereKey && customHereKey.trim().length > 5);

  const month = getCurrentMonthKey();
  const today = getCurrentDayKey();
  const monthKey = `quota:user:${cleanId}:month:${month}`;
  const dayKey = `quota:user:${cleanId}:day:${today}`;

  let monthlyUsed = 0;
  let dailyUsed = 0;

  const redis = await getRedisClient();
  if (redis) {
    try {
      const [rawMonth, rawDay] = await redis.mget<[number | null, number | null]>(monthKey, dayKey);
      monthlyUsed = Number(rawMonth) || 0;
      dailyUsed = Number(rawDay) || 0;
    } catch (err) {
      console.warn('Redis read failed for user quota, using local fallback:', err);
      monthlyUsed = localUserQuotaStore[monthKey] || 0;
      dailyUsed = localUserQuotaStore[dayKey] || 0;
    }
  } else {
    monthlyUsed = localUserQuotaStore[monthKey] || 0;
    dailyUsed = localUserQuotaStore[dayKey] || 0;
  }

  const isDailyExceeded = dailyUsed >= FREE_USER_DAILY_PLAN_LIMIT;
  const isMonthlyExceeded = monthlyUsed >= FREE_USER_MONTHLY_PLAN_LIMIT;
  const isExceeded = isDailyExceeded || isMonthlyExceeded;
  const reason = isMonthlyExceeded ? 'monthly_limit' : isDailyExceeded ? 'daily_limit' : undefined;

  return {
    clientId: cleanId,
    tier: hasCustomGoogle || hasCustomHere ? 'byok' : 'free',
    isExceeded,
    reason,
    monthly: {
      used: monthlyUsed,
      limit: FREE_USER_MONTHLY_PLAN_LIMIT,
      remaining: Math.max(0, FREE_USER_MONTHLY_PLAN_LIMIT - monthlyUsed),
      resetDate: getNextMonthResetDate(),
    },
    daily: {
      used: dailyUsed,
      limit: FREE_USER_DAILY_PLAN_LIMIT,
      remaining: Math.max(0, FREE_USER_DAILY_PLAN_LIMIT - dailyUsed),
    },
    hasCustomGoogleKey: hasCustomGoogle,
    hasCustomHereKey: hasCustomHere,
  };
}

/**
 * Pre-flight check and increment for planning a trip on the shared free tier.
 * If user brings their own key (hasCustomKey === true), quota is NOT deducted.
 */
export async function checkAndIncrementUserPlanQuota(
  clientId: string,
  hasCustomKey: boolean
): Promise<UserQuotaStatus> {
  const cleanId = clientId || 'anonymous';

  // BYOK users bypass free-tier rate limits completely
  if (hasCustomKey) {
    return {
      clientId: cleanId,
      tier: 'byok',
      isExceeded: false,
      monthly: {
        used: 0,
        limit: Infinity,
        remaining: Infinity,
        resetDate: getNextMonthResetDate(),
      },
      daily: {
        used: 0,
        limit: Infinity,
        remaining: Infinity,
      },
      hasCustomGoogleKey: true,
      hasCustomHereKey: true,
    };
  }

  const status = await getUserQuotaStatus(cleanId);

  if (status.monthly.used >= FREE_USER_MONTHLY_PLAN_LIMIT) {
    throw new UserQuotaExceededError(
      `Free tier monthly quota reached (${status.monthly.used}/${FREE_USER_MONTHLY_PLAN_LIMIT} trips planned). You can add your own free Google Maps or HERE API key in Settings to continue planning unlimited trips.`,
      status
    );
  }

  if (status.daily.used >= FREE_USER_DAILY_PLAN_LIMIT) {
    throw new UserQuotaExceededError(
      `Daily trip planning limit reached (${status.daily.used}/${FREE_USER_DAILY_PLAN_LIMIT} trips today). You can add your own free Google Maps or HERE API key in Settings to continue without waiting.`,
      status
    );
  }

  // Under limit: atomically increment counters
  const month = getCurrentMonthKey();
  const today = getCurrentDayKey();
  const monthKey = `quota:user:${cleanId}:month:${month}`;
  const dayKey = `quota:user:${cleanId}:day:${today}`;

  const redis = await getRedisClient();
  if (redis) {
    try {
      const p = redis.pipeline();
      p.incr(monthKey);
      p.expire(monthKey, MONTH_TTL_SECONDS);
      p.incr(dayKey);
      p.expire(dayKey, DAY_TTL_SECONDS);
      await p.exec();
    } catch (err) {
      console.warn('Redis incr failed for user quota, using local fallback:', err);
      localUserQuotaStore[monthKey] = (localUserQuotaStore[monthKey] || 0) + 1;
      localUserQuotaStore[dayKey] = (localUserQuotaStore[dayKey] || 0) + 1;
    }
  } else {
    localUserQuotaStore[monthKey] = (localUserQuotaStore[monthKey] || 0) + 1;
    localUserQuotaStore[dayKey] = (localUserQuotaStore[dayKey] || 0) + 1;
  }

  const updatedMonthlyUsed = status.monthly.used + 1;
  const updatedDailyUsed = status.daily.used + 1;

  return {
    ...status,
    monthly: {
      ...status.monthly,
      used: updatedMonthlyUsed,
      remaining: Math.max(0, FREE_USER_MONTHLY_PLAN_LIMIT - updatedMonthlyUsed),
    },
    daily: {
      ...status.daily,
      used: updatedDailyUsed,
      remaining: Math.max(0, FREE_USER_DAILY_PLAN_LIMIT - updatedDailyUsed),
    },
  };
}
