'use client';

export interface DrivingSession {
  tripId?: string;
  dayIndex: number;
  targetStopId?: string;
  manualTargetIndex?: number | null;
  timestamp: number;
}

const DRIVE_SESSION_KEY = 'trip_planner_active_drive_session';
const MAX_SESSION_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours

export function saveDrivingSession(session: Omit<DrivingSession, 'timestamp'>) {
  if (typeof window === 'undefined') return;
  try {
    const payload: DrivingSession = {
      ...session,
      timestamp: Date.now(),
    };
    localStorage.setItem(DRIVE_SESSION_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('Failed to save driving session:', err);
  }
}

export function loadDrivingSession(expectedTripId?: string): DrivingSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DRIVE_SESSION_KEY);
    if (!raw) return null;

    const session = JSON.parse(raw) as DrivingSession;
    if (!session || typeof session.dayIndex !== 'number') return null;

    // Expire old sessions
    if (Date.now() - session.timestamp > MAX_SESSION_AGE_MS) {
      clearDrivingSession();
      return null;
    }

    // If tripId is provided and does not match, ignore
    if (expectedTripId && session.tripId && session.tripId !== expectedTripId) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export function clearDrivingSession() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(DRIVE_SESSION_KEY);
  } catch (err) {
    console.warn('Failed to clear driving session:', err);
  }
}
