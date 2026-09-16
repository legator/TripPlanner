import { Capacitor } from '@capacitor/core';
import { KeepAwake } from '@capacitor-community/keep-awake';

/**
 * Utility to keep the screen awake using native KeepAwake or the Screen Wake Lock API.
 * Useful when using the app as an in-car GPS navigation companion.
 */

export interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

let activeWakeLock: WakeLockSentinelLike | null = null;
let isNativeKeepAwakeActive = false;

export async function requestScreenWakeLock(): Promise<boolean> {
  // Native Android/iOS via Capacitor KeepAwake
  if (Capacitor.isNativePlatform()) {
    try {
      await KeepAwake.keepAwake();
      isNativeKeepAwakeActive = true;
      return true;
    } catch (err) {
      console.warn('Could not acquire native screen keep-awake:', err);
      return false;
    }
  }

  // Browser Screen Wake Lock API fallback
  if (typeof window === 'undefined' || !('wakeLock' in navigator)) {
    return false;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any;
    activeWakeLock = await nav.wakeLock.request('screen');

    activeWakeLock?.addEventListener?.('release', () => {
      activeWakeLock = null;
    });

    return true;
  } catch (err) {
    console.warn('Could not acquire screen wake lock:', err);
    return false;
  }
}

export async function releaseScreenWakeLock(): Promise<void> {
  // Native Android/iOS release
  if (Capacitor.isNativePlatform() && isNativeKeepAwakeActive) {
    try {
      await KeepAwake.allowSleep();
    } catch {
      // ignore
    } finally {
      isNativeKeepAwakeActive = false;
    }
    return;
  }

  // Browser sentinel release
  if (activeWakeLock && !activeWakeLock.released) {
    try {
      await activeWakeLock.release();
    } catch {
      // ignore
    } finally {
      activeWakeLock = null;
    }
  }
}
