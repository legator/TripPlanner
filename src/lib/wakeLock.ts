/**
 * Utility to keep the screen awake using the Screen Wake Lock API.
 * Useful when using the app as an in-car GPS navigation companion.
 */

export interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

let activeWakeLock: WakeLockSentinelLike | null = null;

export async function requestScreenWakeLock(): Promise<boolean> {
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
