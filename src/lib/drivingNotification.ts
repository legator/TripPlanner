import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { LocalNotifications } from '@capacitor/local-notifications';

const DRIVING_NOTIFICATION_ID = 1001;
const NAVIGATION_CHANNEL_ID = 'driving_navigation';
const ACTION_TYPE_ID = 'DRIVING_NAV_ACTIONS';

let hasRequestedPermission = false;
let isPermissionGranted = false;
let isChannelConfigured = false;
let isActionConfigured = false;
let exitNavigationCallback: (() => void) | null = null;

/**
 * Register callback to exit driving mode when user clicks "Exit navigation" in Android notification.
 */
export function setExitNavigationHandler(handler: () => void) {
  exitNavigationCallback = handler;
}

/**
 * Configure Android status bar for Driving Mode.
 */
export async function setDrivingStatusBar(isDriving: boolean, isMinimized: boolean = false) {
  if (!Capacitor.isNativePlatform()) return;

  try {
    if (isDriving) {
      await StatusBar.setStyle({ style: Style.Dark });
      if (Capacitor.getPlatform() === 'android') {
        await StatusBar.setBackgroundColor({
          color: isMinimized ? '#090d16' : '#030712',
        });
      }
    } else {
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
 * Setup High Importance notification channel and Action Type on Android.
 */
async function setupChannelAndActions() {
  if (!Capacitor.isNativePlatform()) return;

  if (!isChannelConfigured && Capacitor.getPlatform() === 'android') {
    try {
      await LocalNotifications.createChannel({
        id: NAVIGATION_CHANNEL_ID,
        name: 'Navigation',
        description: 'Ongoing navigation turn and status updates',
        importance: 4, // High importance: shows in status bar, lockscreen and peek
        visibility: 1, // Public visibility on lockscreen
        vibration: false,
        lights: false,
      });
      isChannelConfigured = true;
    } catch (e) {
      console.warn('Could not create navigation notification channel:', e);
    }
  }

  if (!isActionConfigured) {
    try {
      await LocalNotifications.registerActionTypes({
        types: [
          {
            id: ACTION_TYPE_ID,
            actions: [
              {
                id: 'exit_navigation',
                title: 'Exit navigation',
                destructive: true,
              },
            ],
          },
        ],
      });

      LocalNotifications.addListener('localNotificationActionPerformed', (notificationAction) => {
        if (notificationAction.actionId === 'exit_navigation') {
          exitNavigationCallback?.();
        }
      });

      isActionConfigured = true;
    } catch (e) {
      console.warn('Could not register navigation actions:', e);
    }
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
      await setupChannelAndActions();
      return true;
    }

    if (!hasRequestedPermission) {
      hasRequestedPermission = true;
      const request = await LocalNotifications.requestPermissions();
      isPermissionGranted = request.display === 'granted';
      if (isPermissionGranted) {
        await setupChannelAndActions();
      }
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
 * Updates the ongoing turn-by-turn navigation notification in Android's Status Bar / Lockscreen.
 * Styled to match Google Maps turn-by-turn navigation (e.g. "TripPlanner · Arrive 7:19 pm · now").
 */
export async function updateDrivingNotification(params: DrivingNotificationParams) {
  if (!Capacitor.isNativePlatform()) return;

  const now = Date.now();
  if (now - lastNotificationTime < NOTIFICATION_THROTTLE_MS) return;
  lastNotificationTime = now;

  try {
    const permitted = await ensureNotificationPermission();
    if (!permitted) return;

    await setupChannelAndActions();

    const speedStr = params.speedKmh ? `${Math.round(params.speedKmh)} km/h` : 'Navigating';
    const distStr =
      params.distanceKm < 1
        ? `${Math.round(params.distanceKm * 1000)} m`
        : `${params.distanceKm.toFixed(1)} km`;
    const etaMinutes = Math.max(1, Math.round(params.driveTimeMin));
    const etaStr = etaMinutes >= 60 ? `${Math.floor(etaMinutes / 60)}h ${etaMinutes % 60}m` : `${etaMinutes} min`;

    // Compute expected arrival clock time (e.g. "7:19 pm")
    const arrivalDate = new Date(Date.now() + etaMinutes * 60000);
    const arriveTimeStr = arrivalDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    const cleanTargetName = params.targetStopName.split(',')[0];

    await LocalNotifications.schedule({
      notifications: [
        {
          id: DRIVING_NOTIFICATION_ID,
          // Header matches Google Maps: "TripPlanner · Arrive 7:19 pm · now"
          title: `TripPlanner • Arrive ${arriveTimeStr} • now`,
          // Main line: "8.0 km · Turn right onto / Next: Pattee Mall"
          body: `${distStr} · Next: ${cleanTargetName}`,
          largeBody: `${distStr} · Next: ${cleanTargetName}\nArrive by ${arriveTimeStr} (~${etaStr}) • Speed: ${speedStr}\nDay ${params.dayIndex + 1} of ${params.totalDays} • TripPlanner Live Route`,
          summaryText: 'Navigation',
          ongoing: true,
          autoCancel: false,
          channelId: NAVIGATION_CHANNEL_ID,
          actionTypeId: ACTION_TYPE_ID,
          iconColor: '#3b82f6',
          extra: {
            dayIndex: params.dayIndex,
            targetStopName: cleanTargetName,
          },
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
