const globalForRedis = globalThis as unknown as {
  _tripPlannerRedis?: import('@upstash/redis').Redis | null;
};

export async function getRedisClient(): Promise<import('@upstash/redis').Redis | null> {
  if ('_tripPlannerRedis' in globalForRedis) {
    return globalForRedis._tripPlannerRedis ?? null;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    globalForRedis._tripPlannerRedis = null;
    return null;
  }

  try {
    const { Redis } = await import('@upstash/redis');
    const client = new Redis({ url, token });
    globalForRedis._tripPlannerRedis = client;
    return client;
  } catch (err) {
    console.warn('Failed to init Redis client:', err);
    globalForRedis._tripPlannerRedis = null;
    return null;
  }
}
