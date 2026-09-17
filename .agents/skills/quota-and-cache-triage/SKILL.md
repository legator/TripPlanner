---
name: quota-and-cache-triage
description: "Step-by-step workflow for inspecting Upstash Redis caching, monitoring HERE and Google Maps API quota consumption, triaging 429 rate limits, and testing graceful fallback mechanisms in TripPlanner."
argument-hint: "Action (e.g., 'inspect Redis quota counters', 'simulate 429 exhaustion', 'verify fallback')"
---

# Quota & Cache Triage (Upstash Redis)

Use this skill when investigating API rate limits, inspecting cached routes, testing quota exhaustion fallbacks, or managing the Upstash Redis persistence layer.

## When To Use
- Investigating `429 Too Many Requests` or quota warnings from HERE or Google Maps APIs
- Inspecting or flushing cached route plans in Upstash Redis
- Testing UI feedback components ([RateLimitBanner.tsx](../../../src/components/RateLimitBanner.tsx), [ApiStatusModal.tsx](../../../src/components/ApiStatusModal.tsx))
- Simulating quota limits to ensure graceful degradation

## Reference Files
- [src/lib/quota/hereQuotaGuard.ts](../../../src/lib/quota/hereQuotaGuard.ts) — HERE API monthly quota enforcement & counter increments
- [src/lib/redisClient.ts](../../../src/lib/redisClient.ts) — Upstash Redis REST client singleton
- [src/app/api/quota/route.ts](../../../src/app/api/quota/route.ts) — Server endpoint returning current usage metrics
- [src/components/ApiStatusModal.tsx](../../../src/components/ApiStatusModal.tsx) — Real-time quota and cache analytics modal
- [src/components/RateLimitBanner.tsx](../../../src/components/RateLimitBanner.tsx) — User warning banner on quota exhaustion

---

## Procedure

### 1. Check API Quota Status
Query the internal quota endpoint:
```bash
# In terminal or browser
curl http://localhost:3000/api/quota
```
Expected response:
```json
{
  "provider": "here",
  "monthlyLimit": 30000,
  "currentUsage": 12450,
  "percentUsed": 41.5,
  "isThrottled": false,
  "resetDate": "2026-10-01T00:00:00.000Z"
}
```

### 2. Inspect Redis Key Structure
In `src/lib/quota/hereQuotaGuard.ts` and `src/lib/redisClient.ts`:
- **Quota Counter**: `quota:here:monthly:<YYYY-MM>` (integer incremented on each routing/search call)
- **Route Cache Key**: `route:cache:<hash>` (cached `RouteResult` with 30-day TTL)
- **Share Link Key**: `trip:share:<token>` (serialized `TripPlan` with 90-day TTL)

### 3. Simulating Quota Exhaustion
To verify that UI banners and fallbacks operate correctly:
1. In `hereQuotaGuard.ts`, temporarily lower the limit or simulate a threshold breach:
   ```typescript
   // Temporary test override
   export async function checkHereQuota(): Promise<{ allowed: boolean }> {
     return { allowed: false }; // Force quota exceeded
   }
   ```
2. Trigger a route planning request from the UI.
3. Verify:
   - `RateLimitBanner` displays: *"HERE Maps monthly quota exceeded. Switched to fallback provider."*
   - System automatically routes via `googleProvider` if configured, or displays an informative error.

### 4. Route Caching Verification
- When identical waypoints and settings are planned twice, `tripPlanner.ts` checks Redis before making external API requests.
- Verify that the second request returns with zero increment to the quota counter and an instant response time (< 50ms).

### 5. Managing Quota via ApiStatusModal
- Open **Settings** → **API & Quota Status** (`ApiStatusModal.tsx`).
- Verify visual progress bars reflect the current usage percentage.
- Verify that cache hit / cache miss metrics update accurately.
