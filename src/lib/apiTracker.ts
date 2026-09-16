'use client';

import { useState, useEffect } from 'react';

export type ApiProvider = 'google' | 'here' | 'openmeteo' | 'app';

export type ApiHealthStatus = 'healthy' | 'warning' | 'rate_limited';

export interface ProviderStats {
  provider: ApiProvider;
  name: string;
  totalRequestsToday: number;
  totalRequestsSession: number;
  status: ApiHealthStatus;
  lastError: string | null;
  rateLimitedUntil: number | null; // epoch timestamp ms
  lastUsed: number | null;
  suggestedAlternative?: ApiProvider;
}

export interface ApiTrackerState {
  providers: Record<ApiProvider, ProviderStats>;
  lastUpdated: number;
}

const STORAGE_KEY = 'tripplanner_api_tracker_v1';

function getInitialProviderStats(provider: ApiProvider): ProviderStats {
  const meta: Record<ApiProvider, { name: string; alt?: ApiProvider }> = {
    google: { name: 'Google Maps Platform', alt: 'here' },
    here: { name: 'HERE Maps Platform', alt: 'google' },
    openmeteo: { name: 'Open-Meteo Weather', alt: undefined },
    app: { name: 'TripPlanner API', alt: undefined },
  };

  return {
    provider,
    name: meta[provider].name,
    totalRequestsToday: 0,
    totalRequestsSession: 0,
    status: 'healthy',
    lastError: null,
    rateLimitedUntil: null,
    lastUsed: null,
    suggestedAlternative: meta[provider].alt,
  };
}

function getDefaultState(): ApiTrackerState {
  return {
    providers: {
      google: getInitialProviderStats('google'),
      here: getInitialProviderStats('here'),
      openmeteo: getInitialProviderStats('openmeteo'),
      app: getInitialProviderStats('app'),
    },
    lastUpdated: Date.now(),
  };
}

let memoryState: ApiTrackerState = getDefaultState();
const listeners = new Set<(state: ApiTrackerState) => void>();

function getTodayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadState(): ApiTrackerState {
  if (typeof window === 'undefined') return getDefaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultState();
    const parsed = JSON.parse(raw);
    const lastDate = parsed.date;
    const today = getTodayString();

    const state = getDefaultState();
    if (parsed.providers) {
      for (const key of Object.keys(state.providers) as ApiProvider[]) {
        if (parsed.providers[key]) {
          state.providers[key] = {
            ...state.providers[key],
            ...parsed.providers[key],
            totalRequestsSession: 0,
            totalRequestsToday: lastDate === today ? parsed.providers[key].totalRequestsToday || 0 : 0,
          };
          if (state.providers[key].rateLimitedUntil && Date.now() > state.providers[key].rateLimitedUntil!) {
            state.providers[key].status = 'healthy';
            state.providers[key].rateLimitedUntil = null;
            state.providers[key].lastError = null;
          }
        }
      }
    }
    return state;
  } catch {
    return getDefaultState();
  }
}

function saveState(state: ApiTrackerState) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        date: getTodayString(),
        providers: state.providers,
      })
    );
  } catch {
    // Ignore storage errors
  }
}

if (typeof window !== 'undefined') {
  memoryState = loadState();
}

function notifyListeners() {
  const current = { ...memoryState, lastUpdated: Date.now() };
  memoryState = current;
  saveState(current);
  listeners.forEach((fn) => fn(current));
}

/**
 * Record an API call outcome for tracking and rate-limit detection.
 */
export function recordApiCall(
  provider: ApiProvider,
  success: boolean,
  statusCode?: number,
  errorMessage?: string,
  retryAfterSeconds?: number
) {
  const current = memoryState.providers[provider] || getInitialProviderStats(provider);
  current.totalRequestsSession++;
  current.totalRequestsToday++;
  current.lastUsed = Date.now();

  const isRateLimited =
    statusCode === 429 ||
    statusCode === 403 ||
    (errorMessage && /rate limit|quota|exceeded|too many requests|over_query_limit|resource_exhausted/i.test(errorMessage));

  if (isRateLimited) {
    current.status = 'rate_limited';
    current.lastError = errorMessage || 'API request limit reached';
    const cooldownMs = (retryAfterSeconds ? retryAfterSeconds : 60) * 1000;
    current.rateLimitedUntil = Date.now() + cooldownMs;
  } else if (!success) {
    if (current.status !== 'rate_limited') {
      current.status = 'warning';
      current.lastError = errorMessage || 'Request failed';
    }
  } else {
    if (current.status === 'rate_limited' && current.rateLimitedUntil && Date.now() > current.rateLimitedUntil) {
      current.status = 'healthy';
      current.lastError = null;
      current.rateLimitedUntil = null;
    } else if (current.status === 'warning') {
      current.status = 'healthy';
      current.lastError = null;
    }
  }

  memoryState.providers[provider] = { ...current };
  notifyListeners();
}

/**
 * Reset / clear rate limit lock for a provider.
 */
export function clearRateLimit(provider: ApiProvider) {
  if (memoryState.providers[provider]) {
    memoryState.providers[provider].status = 'healthy';
    memoryState.providers[provider].lastError = null;
    memoryState.providers[provider].rateLimitedUntil = null;
    notifyListeners();
  }
}

/**
 * Check if an error message/status is a rate limit or quota exceeded error.
 */
export function parseRateLimitDetails(
  error: unknown,
  fallbackProvider: ApiProvider = 'app'
): { isRateLimit: boolean; provider: ApiProvider; message: string; retryAfter?: number } {
  const errMsg = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const isLimit =
    /rate limit|quota|exceeded|too many requests|over_query_limit|resource_exhausted|429/i.test(errMsg);

  let provider: ApiProvider = fallbackProvider;
  if (/google/i.test(errMsg)) provider = 'google';
  else if (/here/i.test(errMsg)) provider = 'here';
  else if (/weather|open-meteo/i.test(errMsg)) provider = 'openmeteo';

  let retryAfter = 60;
  const match = errMsg.match(/(\d+)\s*sec/i);
  if (match) retryAfter = parseInt(match[1], 10);

  return {
    isRateLimit: isLimit,
    provider,
    message: errMsg || 'Rate limit reached',
    retryAfter,
  };
}

/**
 * React hook to access live API tracker statistics and health states.
 */
export function useApiTracker(): ApiTrackerState {
  const [state, setState] = useState<ApiTrackerState>(() => memoryState);

  useEffect(() => {
    const checkExpiry = () => {
      let changed = false;
      const now = Date.now();
      for (const p of Object.keys(memoryState.providers) as ApiProvider[]) {
        const item = memoryState.providers[p];
        if (item.rateLimitedUntil && now > item.rateLimitedUntil) {
          item.status = 'healthy';
          item.rateLimitedUntil = null;
          item.lastError = null;
          changed = true;
        }
      }
      if (changed) notifyListeners();
    };

    const interval = setInterval(checkExpiry, 3000);
    const listener = (newState: ApiTrackerState) => setState(newState);
    listeners.add(listener);

    return () => {
      clearInterval(interval);
      listeners.delete(listener);
    };
  }, []);

  return state;
}
