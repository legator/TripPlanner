import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { LocalNotifications } from '@capacitor/local-notifications';

const DRIVING_NOTIFICATION_ID = 1001;
let hasRequestedPermission = false;
let isPermissionGranted = false;

/**
 * Configure Android status bar for Driving Mode.
 */
export async function setDrivingStatusBar(isDriving: boolean, isMinimized: boolean = false) {
  if (!Capacitor.isNativePlatform()) return;

  try {
    if (isDriving) {
      // Dark slate theme during driving
      await StatusBar.setStyle({ style: Style.Dark });
      if (Capacitor.getPlatform() === 'android') {
        await StatusBar.setBackgroundColor({
          color: isMinimized ? '#1e293b' : '#090d16',
        });
      }
    } else {
      // Restore default dark style
      await StatusBar.setStyle({ style: Style.Dark });
      if (Capacitor.getPlatform() === 'android') {
        await StatusBar.setBackgroundColor({ color: '#111827' });
      }
    }
  } catch (err) {
    console.warn('Status bar configuration error:', err);
  }
}

/**
 * Ensure notification permissions are requested on mobile.
 */
async function ensureNotificationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  if (isPermissionGranted) return true;

  try {
    const status = await LocalNotifications.checkPermissions();
    if (status.display === 'granted') {
      isPermissionGranted = true;
      return true;
    }

    if (!hasRequestedPermission) {
      hasRequestedPermission = true;
      const request = await LocalNotifications.requestPermissions();
      isPermissionGranted = request.display === 'granted';
      return isPermissionGranted;
    }
    return false;
  } catch {
    return false;
  }
}

interface DrivingNotificationParams {
  targetStopName: string;
  distanceKm: number;
  driveTimeMin: number;
  speedKmh?: number | null;
  dayIndex: number;
  totalDays: number;
}

let lastNotificationTime = 0;
const NOTIFICATION_THROTTLE_MS = 2500; // avoid spamming OS notifications

/**
 * Updates the ongoing system notification in Android's Status Bar.
 */
export async function updateDrivingNotification(params: DrivingNotificationParams) {
  if (!Capacitor.isNativePlatform()) return;

  const now = Date.now();
  if (now - lastNotificationTime < NOTIFICATION_THROTTLE_MS) return;
  lastNotificationTime = now;

  try {
    const permitted = await ensureNotificationPermission();
    if (!permitted) return;

    const speedStr = params.speedKmh ? `${Math.round(params.speedKmh)} km/h` : 'Active';
    const distStr = params.distanceKm < 1 ? `${Math.round(params.distanceKm * 1000)} m` : `${params.distanceKm.toFixed(1)} km`;
    const etaStr = `${Math.round(params.driveTimeMin)} min`;

    await LocalNotifications.schedule({
      notifications: [
        {
          id: DRIVING_NOTIFICATION_ID,
          title: `🚗 Driving • Day ${params.dayIndex + 1} (${speedStr})`,
          body: `Next: ${params.targetStopName} • ${distStr} • ${etaStr}`,
          ongoing: true,
          autoCancel: false,
          smallIcon: 'ic_stat_name', // uses default android notification icon if absent
          actionTypeId: 'DRIVING_STATUS',
        },
      ],
    });
  } catch (err) {
    console.warn('Failed to update driving notification:', err);
  }
}

/**
 * Clears the ongoing driving notification when exiting driving mode.
 */
export async function clearDrivingNotification() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await LocalNotifications.cancel({
      notifications: [{ id: DRIVING_NOTIFICATION_ID }],
    });
  } catch (err) {
    console.warn('Failed to clear driving notification:', err);
  }
}
