'use client';

import { TripPlan, TripSettings, Waypoint } from './types';

export interface SharedTripState {
  waypoints: Waypoint[];
  settings: TripSettings;
  tripPlan: TripPlan;
}

/** Encode the current trip state into a URL hash. */
export function encodeTripToURL(state: SharedTripState): string {
  try {
    const json = JSON.stringify(state);
    // btoa works on ASCII; use encodeURIComponent → unescape for full UTF-8 support
    const encoded = btoa(unescape(encodeURIComponent(json)));
    const url = new URL(window.location.href);
    url.hash = `trip=${encoded}`;
    return url.toString();
  } catch {
    return window.location.href;
  }
}

/** Decode a trip state from the current URL hash, or return null. */
export function decodeTripFromURL(): SharedTripState | null {
  try {
    const hash = window.location.hash;
    const match = hash.match(/^#trip=(.+)$/);
    if (!match) return null;
    const json = decodeURIComponent(escape(atob(match[1])));
    return JSON.parse(json) as SharedTripState;
  } catch {
    return null;
  }
}

/** Copy the shareable URL to the clipboard. Returns true on success. */
export async function copyShareURL(state: SharedTripState): Promise<boolean> {
  const url = encodeTripToURL(state);
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Upload the trip to the server-side KV store and copy a short URL.
 * Falls back to the hash-based URL if KV is unavailable.
 * Returns true on success.
 */
export async function createAndCopyShortLink(state: SharedTripState): Promise<{ ok: boolean; short: boolean }> {
  try {
    const res = await fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    if (res.ok) {
      const { id } = await res.json();
      const url = `${window.location.origin}${window.location.pathname}?share=${id}`;
      await navigator.clipboard.writeText(url);
      return { ok: true, short: true };
    }
  } catch {
    // Fall through to hash-based URL
  }
  // Fallback: hash URL
  const ok = await copyShareURL(state);
  return { ok, short: false };
}

/**
 * If the URL has ?share=<id>, load the trip from KV and return it.
 * Otherwise return null.
 */
export async function loadTripFromShareParam(): Promise<SharedTripState | null> {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const id = params.get('share');
  if (!id) return null;

  try {
    const res = await fetch(`/api/share?id=${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const data = await res.json();
    // Clean up the URL
    const url = new URL(window.location.href);
    url.searchParams.delete('share');
    history.replaceState(null, '', url.pathname + (url.search === '?' ? '' : url.search));
    return data as SharedTripState;
  } catch {
    return null;
  }
}
