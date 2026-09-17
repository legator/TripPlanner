/**
 * HERE API Free-Tier Quota Guard & Metering
 *
 * Enforces strict limits based on HERE Base Plan (Freemium):
 * - 30,000 total free transactions per month
 * - Routing API: 30,000 / month
 * - Search & Browse API: 30,000 / month
 * - Traffic Flow: 30,000 / month
 * - Static Map Images: 30,000 / month
 * - Matrix Routing: 10,000 elements / month
 * - Isoline Routing: 2,500 isolines / month
 *
 * Uses Upstash Redis (or Vercel KV) for sub-millisecond atomic tracking across all users.
 * Falls back seamlessly to persistent memory/storage when Redis credentials are not provided.
 */

export type HereServiceType =
  | 'routing'
  | 'search'
  | 'traffic'
  | 'static_map'
  | 'matrix'
  | 'isoline';

export interface ServiceLimitConfig {
  limit: number;
  label: string;
  icon: string;
}

export const HERE_QUOTA_LIMITS: Record<HereServiceType, ServiceLimitConfig> = {
  routing: { limit: 30000, label: 'Routing API v8', icon: '🚗' },
  search: { limit: 30000, label: 'Geocoding & Search API', icon: '🔍' },
  traffic: { limit: 30000, label: 'Traffic Flow & Incidents', icon: '🚦' },
  static_map: { limit: 30000, label: 'Map Image API', icon: '🗺️' },
  matrix: { limit: 10000, label: 'Matrix Routing Elements', icon: '🌐' },
  isoline: { limit: 2500, label: 'Isoline Reachability', icon: '⏱️' },
};

// Global monthly account limit with safety buffer (stop at 29,500 to prevent any paid overage)
export const HERE_GLOBAL_MONTHLY_LIMIT = 30000;
export const HERE_SAFETY_THRESHOLD = 29500;

const KEY_TTL_SECONDS = 60 * 60 * 24 * 35; // 35 days (covers full calendar month)

export class HereQuotaExceededError extends Error {
  service: HereServiceType;
  currentUsage: number;
  limit: number;

  constructor(service: HereServiceType, currentUsage: number, limit: number) {
    const serviceConfig = HERE_QUOTA_LIMITS[service];
    super(
      `HERE Free Quota Exceeded: ${serviceConfig.label} has reached ${currentUsage.toLocaleString()} / ${limit.toLocaleString()} free requests this month. Please switch to Google Maps in settings to continue.`
    );
    this.name = 'HereQuotaExceededError';
    this.service = service;
    this.currentUsage = currentUsage;
    this.limit = limit;
  }
}

export interface HereServiceUsageSummary {
  service: HereServiceType;
  label: string;
  icon: string;
  used: number;
  limit: number;
  remaining: number;
  percentUsed: number;
}

export interface HereUsageSummary {
  isRedisConnected: boolean;
  storageMode: 'redis_cloud' | 'local_memory';
  currentMonth: string;
  totalUsed: number;
  totalLimit: number;
  totalRemaining: number;
  percentUsed: number;
  isExceeded: boolean;
  services: HereServiceUsageSummary[];
}

// ─── Redis Connection Helper ──────────────────────────────────────────────────

function getRedisCredentials(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) {
    return { url, token };
  }
  return null;
}

// ─── Local fallback store (persists across Next.js API chunks via globalThis) ─

const globalForQuota = globalThis as unknown as {
  hereQuotaStore?: Record<string, number>;
};

const localUsageStore: Record<string, number> =
  globalForQuota.hereQuotaStore || (globalForQuota.hereQuotaStore = {});

function getCurrentMonthKey(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// ─── Core Quota Functions ───────────────────────────────────────────────────

/**
 * Pre-flight check and increment for HERE API calls.
 * Throws HereQuotaExceededError if the monthly limit would be exceeded.
 */
export async function checkAndIncrementHereQuota(
  service: HereServiceType,
  count: number = 1
): Promise<{ remaining: number; totalUsed: number }> {
  const month = getCurrentMonthKey();
  const creds = getRedisCredentials();
  const serviceLimit = HERE_QUOTA_LIMITS[service].limit;

  const totalKey = `here:usage:total:${month}`;
  const serviceKey = `here:usage:${service}:${month}`;

  if (creds) {
    try {
      const { Redis } = await import('@upstash/redis');
      const redis = new Redis({ url: creds.url, token: creds.token });

      // Read current values first (pre-flight check)
      const [rawTotal, rawService] = await redis.mget<[number | null, number | null]>(
        totalKey,
        serviceKey
      );

      const currentTotal = Number(rawTotal) || 0;
      const currentService = Number(rawService) || 0;

      // Check against limits
      if (currentTotal + count > HERE_SAFETY_THRESHOLD) {
        throw new HereQuotaExceededError(service, currentTotal, HERE_GLOBAL_MONTHLY_LIMIT);
      }
      if (currentService + count > serviceLimit) {
        throw new HereQuotaExceededError(service, currentService, serviceLimit);
      }

      // Increment atomically in pipeline
      const p = redis.pipeline();
      p.incrby(totalKey, count);
      p.expire(totalKey, KEY_TTL_SECONDS);
      p.incrby(serviceKey, count);
      p.expire(serviceKey, KEY_TTL_SECONDS);
      const results = await p.exec();

      const newTotal = Number(results[0]) || currentTotal + count;
      return {
        remaining: Math.max(0, HERE_GLOBAL_MONTHLY_LIMIT - newTotal),
        totalUsed: newTotal,
      };
    } catch (err) {
      if (err instanceof HereQuotaExceededError) {
        throw err;
      }
      console.warn('Upstash Redis quota check failed, falling back to local store:', err);
    }
  }

  // Fallback: Local memory store
  const currentTotal = localUsageStore[totalKey] || 0;
  const currentService = localUsageStore[serviceKey] || 0;

  if (currentTotal + count > HERE_SAFETY_THRESHOLD) {
    throw new HereQuotaExceededError(service, currentTotal, HERE_GLOBAL_MONTHLY_LIMIT);
  }
  if (currentService + count > serviceLimit) {
    throw new HereQuotaExceededError(service, currentService, serviceLimit);
  }

  localUsageStore[totalKey] = currentTotal + count;
  localUsageStore[serviceKey] = currentService + count;

  const newTotal = localUsageStore[totalKey];
  return {
    remaining: Math.max(0, HERE_GLOBAL_MONTHLY_LIMIT - newTotal),
    totalUsed: newTotal,
  };
}

/**
 * Retrieve a complete usage summary for UI dashboards and status modals.
 */
export async function getHereUsageSummary(): Promise<HereUsageSummary> {
  const month = getCurrentMonthKey();
  const creds = getRedisCredentials();
  const isRedisConnected = !!creds;

  const totalKey = `here:usage:total:${month}`;
  const serviceKeys = (Object.keys(HERE_QUOTA_LIMITS) as HereServiceType[]).map(
    (s) => `here:usage:${s}:${month}`
  );

  let currentTotal = 0;
  const serviceCounts: Record<HereServiceType, number> = {
    routing: 0,
    search: 0,
    traffic: 0,
    static_map: 0,
    matrix: 0,
    isoline: 0,
  };

  if (creds) {
    try {
      const { Redis } = await import('@upstash/redis');
      const redis = new Redis({ url: creds.url, token: creds.token });

      const values = await redis.mget<Array<number | null>>(totalKey, ...serviceKeys);
      currentTotal = Number(values[0]) || 0;

      (Object.keys(HERE_QUOTA_LIMITS) as HereServiceType[]).forEach((service, index) => {
        serviceCounts[service] = Number(values[index + 1]) || 0;
      });
    } catch (err) {
      console.warn('Failed to read Redis quota, using local fallback:', err);
      currentTotal = localUsageStore[totalKey] || 0;
      (Object.keys(HERE_QUOTA_LIMITS) as HereServiceType[]).forEach((s) => {
        serviceCounts[s] = localUsageStore[`here:usage:${s}:${month}`] || 0;
      });
    }
  } else {
    currentTotal = localUsageStore[totalKey] || 0;
    (Object.keys(HERE_QUOTA_LIMITS) as HereServiceType[]).forEach((s) => {
      serviceCounts[s] = localUsageStore[`here:usage:${s}:${month}`] || 0;
    });
  }

  const services: HereServiceUsageSummary[] = (
    Object.keys(HERE_QUOTA_LIMITS) as HereServiceType[]
  ).map((service) => {
    const config = HERE_QUOTA_LIMITS[service];
    const used = serviceCounts[service];
    const remaining = Math.max(0, config.limit - used);
    const percentUsed = Math.round((used / config.limit) * 1000) / 10;
    return {
      service,
      label: config.label,
      icon: config.icon,
      used,
      limit: config.limit,
      remaining,
      percentUsed,
    };
  });

  const totalRemaining = Math.max(0, HERE_GLOBAL_MONTHLY_LIMIT - currentTotal);
  const percentUsed = Math.round((currentTotal / HERE_GLOBAL_MONTHLY_LIMIT) * 1000) / 10;

  return {
    isRedisConnected,
    storageMode: isRedisConnected ? 'redis_cloud' : 'local_memory',
    currentMonth: month,
    totalUsed: currentTotal,
    totalLimit: HERE_GLOBAL_MONTHLY_LIMIT,
    totalRemaining,
    percentUsed,
    isExceeded: currentTotal >= HERE_SAFETY_THRESHOLD,
    services,
  };
}
