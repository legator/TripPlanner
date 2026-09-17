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

### 3. Server URL Configuration (Live Reload vs. Production)
In `capacitor.config.ts`, the WebView server URL is configured dynamically:
- In **development** (`NODE_ENV === 'development'`), it defaults to your local development machine IP (`http://192.168.0.163:3000`).
- For **production builds or CI**, set the `CAPACITOR_SERVER_URL` environment variable (e.g. `CAPACITOR_SERVER_URL=https://your-trip-planner.vercel.app`).
- If `CAPACITOR_SERVER_URL` is omitted in production, `server` is omitted to avoid baking private LAN IPs into production binaries.

### 4. Headless & IDE Builds

#### Headless CLI Builds (Fast & Automated):
```bash
# Build web app and sync both platforms
npm run build:mobile

# Build Android debug APK
npm run build:android

# Build Android release bundle/APK
npm run build:android:release

# Build & verify iOS project for simulator
npm run build:ios:sim
```

#### Native IDE Launches:
```bash
# Open Android Studio
npm run cap:android

# Open Xcode
npm run cap:ios
```

### 5. Automated CI/CD (GitHub Actions)
The repository includes an automated workflow at `.github/workflows/mobile-build.yml`:
- Runs automatically on changes to native mobile directories (`android/`, `ios/`, `capacitor.config.ts`).
- Can be triggered on-demand via **Actions → Mobile CI & Builds → Run workflow** (choose `all`, `android`, or `ios`, and provide an optional `server_url`).
- Compiles the Android debug APK on `ubuntu-latest` and attaches `trip-planner-android-debug.apk` directly to the workflow run artifacts for instant download and mobile testing.
- Verifies iOS compilation on `macos-14` runners without signing roadblocks (`CODE_SIGNING_ALLOWED=NO`).

### 6. Store Release Deployment (Google Play & Apple TestFlight)
For publishing production builds directly to store testing channels, a dedicated release workflow is provided at `.github/workflows/mobile-release.yml` (completely isolated from regular builds):
- **Triggers**:
  - Pushing a release tag matching `v*.*.*` (e.g., `v1.0.0`)
  - On-demand via **Actions → Mobile Store Release → Run workflow** (choose `platform`, target Google Play `track`, and optional `server_url`).

#### Required GitHub Secrets:
To activate store publishing, configure the following secrets in **Settings → Secrets and variables → Actions**:

**Google Play**:
- `ANDROID_KEYSTORE_BASE64`: Base64-encoded release `.keystore` file (`base64 -w 0 my-release-key.keystore`)
- `ANDROID_KEYSTORE_PASSWORD`: Keystore password
- `ANDROID_KEY_ALIAS`: Key alias name
- `ANDROID_KEY_PASSWORD`: Key password
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`: Full JSON key file of a Google Cloud Service Account with permissions in Google Play Console

**Apple TestFlight**:
- `APP_STORE_CONNECT_API_KEY_ID`: 10-character Key ID from App Store Connect
- `APP_STORE_CONNECT_API_ISSUER_ID`: Issuer ID UUID from App Store Connect
- `APP_STORE_CONNECT_API_KEY_P8`: Content of the `.p8` private key (`AuthKey_XXXXXX.p8`)
- `APPLE_CERTIFICATE_BASE64`: Base64-encoded Apple Distribution certificate (`.p12`)
- `APPLE_CERTIFICATE_PASSWORD`: Password for the `.p12` file
- `APPLE_PROVISIONING_PROFILE_BASE64`: Base64-encoded App Store Distribution provisioning profile (`.mobileprovision`)

*(Note: If credentials are not configured, the release workflow warns and skips the upload steps gracefully without failing the entire run).*

### 7. Validate Native/Web Hybrid Fallbacks
Always ensure components check `Capacitor.isNativePlatform()` before executing native-only calls:
```typescript
import { Capacitor } from '@capacitor/core';
if (Capacitor.isNativePlatform()) {
  // Use Capacitor Native Plugin
} else {
  // Fall back to Web Browser Standard API
}
```

