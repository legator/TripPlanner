---
name: capacitor-mobile-build
description: "Step-by-step workflow for syncing, configuring, and building TripPlanner native Android and iOS mobile applications with Capacitor 8, including native plugin verification and permission configuration."
argument-hint: "Platform or task (e.g., 'Android APK build', 'iOS location permissions', 'Capacitor plugin sync')"
---

# Capacitor Mobile Build & Native Plugins

Use this skill when building native mobile packages, syncing web assets, configuring mobile app permissions, or debugging Capacitor plugins.

## When To Use
- Generating Android APK/AAB or iOS Xcode project builds
- Configuring mobile native permissions (Fine Location, Background Location, WakeLock, Notifications)
- Syncing code changes to native platforms via `npm run cap:sync`
- Debugging native device APIs vs. web browser fallback behavior

## Reference Files
- [capacitor.config.ts](../../../capacitor.config.ts) — App ID (`com.tripplanner.app`), app name, and webDir
- [package.json](../../../package.json) — Capacitor dependencies (`@capacitor/core`, `@capacitor/android`, `@capacitor/ios`, plugins)
- [src/lib/location.ts](../../../src/lib/location.ts) — Hybrid geolocation layer: uses `@capacitor/geolocation` on device, falls back to `navigator.geolocation` on web
- [src/lib/wakeLock.ts](../../../src/lib/wakeLock.ts) — Screen keep-awake: uses `@capacitor-community/keep-awake` on device, falls back to Web WakeLock API
- [src/lib/drivingNotification.ts](../../../src/lib/drivingNotification.ts) — Local notifications during navigation
- `android/app/src/main/AndroidManifest.xml` — Android permissions and intent filters
- `ios/App/App/Info.plist` — iOS privacy permissions and usage descriptions

---

## Procedure

### 1. Synchronize Plugins & Assets
Whenever dependencies or configurations change, sync the native project directories:
```bash
npm run cap:sync
```
This updates `android/` and `ios/` with native plugin bindings and copy assets.

### 2. Configure Native Permissions

#### Android (`android/app/src/main/AndroidManifest.xml`)
Verify the following permissions exist inside `<manifest>`:
```xml
<!-- Geolocation for turn-by-turn navigation -->
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-feature android:name="android.hardware.location.gps" />

<!-- Keep screen on during driving HUD -->
<uses-permission android:name="android.permission.WAKE_LOCK" />

<!-- Background local alerts -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

#### iOS (`ios/App/App/Info.plist`)
Ensure privacy usage keys are present in `<dict>`:
```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>TripPlanner requires your location for turn-by-turn navigation.</string>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>TripPlanner tracks your position along your itinerary to notify you of upcoming stops.</string>
```

### 3. Development Mode Configuration (Live Reload)
For live debugging on physical devices or emulators, point `capacitor.config.ts` to your local machine IP:
```typescript
const config: CapacitorConfig = {
  appId: 'com.tripplanner.app',
  appName: 'TripPlanner',
  webDir: 'public',
  server: {
    url: 'http://192.168.1.50:3000', // Your local development server IP
    cleartext: true
  }
};
```
*(Note: Remove or comment out `server.url` before creating standalone production bundles).*

### 4. Build and Run on Native Platforms

#### Android:
```bash
npm run cap:android
```
- Opens Android Studio.
- Run on connected device or emulator.
- For release APK: **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**.

#### iOS:
```bash
npm run cap:ios
```
- Opens Xcode.
- Select target device/simulator and press **Run** (`Cmd + R`).

### 5. Validate Native/Web Hybrid Fallbacks
Always ensure components check `Capacitor.isNativePlatform()` before executing native-only calls:
```typescript
import { Capacitor } from '@capacitor/core';
if (Capacitor.isNativePlatform()) {
  // Use Capacitor Native Plugin
} else {
  // Fall back to Web Browser Standard API
}
```
