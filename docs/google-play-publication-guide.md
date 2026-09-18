# TripPlanner — Google Play Store Publication & Release Guide

This guide provides the complete, step-by-step procedure for preparing, hardening, auditing, and publishing **TripPlanner** to the **Google Play Store**.

---

## 1. Prerequisites & Release Signing Key

Google Play requires that all release bundles (`.aab`) are signed with an upload key before upload. Google Play App Signing will then manage the final distribution key.

### A. Generate an Upload Keystore (One-Time Setup)
Run the following command in a secure terminal (keep the `.keystore` file in a safe backup location; **NEVER commit it to Git**):

```bash
keytool -genkey -v -keystore tripplanner-upload.keystore \
  -alias tripplanner \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

*Record the following securely:*
* **Keystore file path**: e.g., `/secure/path/tripplanner-upload.keystore`
* **Keystore password**: password chosen during prompt
* **Key alias**: `tripplanner`
* **Key password**: password for the alias

### B. Extract SHA-1 & SHA-256 Fingerprints
You will need these fingerprints to restrict API keys in Google Cloud Console and register in Google Play Console:

```bash
keytool -list -v -keystore tripplanner-upload.keystore -alias tripplanner
```
Look for:
```
Certificate fingerprints:
  SHA1: 4B:72:...
  SHA256: 8C:E1:...
```

---

## 2. API Key Security & Restrictions

TripPlanner uses Google Maps (and optionally HERE Platform) for navigation, places, and routing.

### A. Restrict `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in Google Cloud Console
Open [Google Cloud Console Credentials](https://console.cloud.google.com/google/maps-apis/credentials) and configure:

1. **API Restrictions**:
   Select **Restrict key** and enable only the required APIs:
   - Maps JavaScript API
   - Places API / Places API (New)
   - Directions API
   - Geocoding API

2. **Application Restrictions**:
   * **Web/WebView Mode (Configured)**: Your app loads from `https://trip-planner-road-trip.vercel.app`. Choose **Websites (HTTP referrers)** and add:
     - `https://trip-planner-road-trip.vercel.app/*`
   * **Android Native Mode (Optional)**: If configuring Android app restrictions:
     - Package name: `com.arleons.tripplanner.app`
     - SHA-1 certificate fingerprint from Step 1B.

### B. Restrict `NEXT_PUBLIC_HERE_API_KEY` (If using HERE Maps)
In the [HERE Developer Portal](https://platform.here.com), configure domain/origin restrictions matching your production hostname.

---

## 3. Pre-Release Verification & Key Audit

TripPlanner includes an automated audit script that verifies manifest security, network configurations, assets, and ensures no database or server secrets leak into client bundles.

Run the audit before any release:

```bash
npm run verify:release
```

This validates:
- [x] Cleartext traffic is disabled (`android:usesCleartextTraffic="false"`).
- [x] Network security config blocks cleartext in `<base-config>`.
- [x] Android assets (`android/app/src/main/assets/`) contain no `.env`, `.pem`, `.key`, or `.keystore` files.
- [x] `capacitor.config.json` contains only safe, public properties.
- [x] Client bundles (`.next/static/`) contain zero Upstash Redis tokens or server secrets.
- [x] App ID and version codes match between configs.

---

## 4. Building the Release Android App Bundle (`.aab`)

Google Play requires the **Android App Bundle (`.aab`)** format.

### A. Build with Production Server URL
Because TripPlanner utilizes dynamic server-side API routes (`/api/plan`, `/api/quota`, etc.), build the bundle with your live production URL:

```bash
# capacitor.config.ts is pre-configured with https://trip-planner-road-trip.vercel.app
npm run build:android:bundle
```

The output bundle will be generated at:
```
android/app/build/outputs/bundle/release/app-release.aab
```

### B. Sign the Bundle Locally (If Not Using CI)
If building locally, sign the bundle using `jarsigner`:

```bash
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 \
  -keystore tripplanner-upload.keystore \
  android/app/build/outputs/bundle/release/app-release.aab \
  tripplanner
```

Or configure environment variables:
```bash
$env:ANDROID_KEYSTORE_PATH="C:/path/to/tripplanner-upload.keystore"
$env:ANDROID_KEYSTORE_PASSWORD="your-keystore-password"
$env:ANDROID_KEY_ALIAS="tripplanner"
$env:ANDROID_KEY_PASSWORD="your-key-password"
npm run build:android:bundle
```

### C. Automated CI/CD Release (GitHub Actions)
The repository includes `.github/workflows/mobile-release.yml`. You can deploy directly to Google Play Internal Testing:

1. Configure the following secrets in **GitHub → Settings → Secrets and variables → Actions**:
   - `ANDROID_KEYSTORE_BASE64`: Base64 string of your `.keystore` file (`base64 -w 0 tripplanner-upload.keystore`)
   - `ANDROID_KEYSTORE_PASSWORD`: Keystore password
   - `ANDROID_KEY_ALIAS`: `tripplanner`
   - `ANDROID_KEY_PASSWORD`: Key password
   - `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`: Full JSON key file of a Google Cloud Service Account linked to Google Play Console
2. Push a release tag (e.g. `git tag v1.0.0`) or trigger manually from **Actions → Mobile Store Release**.

---

## 5. Google Play Console Submission Requirements

When creating your app listing in Google Play Console:

### A. App Listing Details
- **App Name**: TripPlanner: Road Trip
- **Short Description** (up to 80 chars): Smart multi-day road trip planner with real-time turn-by-turn navigation HUD.
- **Full Description**: Complete road trip planning, weather forecasts along routes, EV charging stops, expense ledger, and real-time driving navigation.
- **Category**: Travel & Local
- **Target Audience**: Ages 18+

### B. Store Visual Assets
- **App Icon**: 512 × 512 px PNG (32-bit, max 1024 KB)
- **Feature Graphic**: 1024 × 500 px JPG or 24-bit PNG
- **Phone Screenshots**: At least 2 screenshots (16:9 or 9:16 aspect ratio, between 320 px and 3840 px)
- **7-inch & 10-inch Tablet Screenshots**: Optional, recommended for wider reach

### C. Permissions & Location Declaration
Google Play closely scrutinizes location permissions (`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `FOREGROUND_SERVICE_LOCATION`):

1. **Why does the app access location?**
   - *Declaration*: "TripPlanner uses fine location in the foreground to provide real-time turn-by-turn driving navigation, lane guidance, off-route recalculation, and proximity alerts to upcoming itinerary stops."
2. **Foreground Service Declaration**:
   - Select **Foreground Service — Location**.
   - You must upload a short video (YouTube link or MP4) demonstrating the active Driving HUD following a simulated or real route while the device is in motion.

### D. Data Safety Declaration
- **Location**:
  - Collected: Yes (Approximate & Precise location)
  - Shared: No (Location data is processed ephemeral on-device and is never shared with third-party data brokers)
  - Purpose: App functionality (Navigation & Route planning)
  - Ephemeral: Yes (Not stored permanently on external servers)
- **Data Security**:
  - Data encrypted in transit: **Yes** (All network communication enforces HTTPS / TLS)
  - Data deletion request: Provide account/data deletion mechanism or note that trip data is stored in user local storage.

### E. Privacy Policy URL
A public HTTPS Privacy Policy link is **mandatory**. Ensure your hosted website has a `/privacy` page accessible to users and Google reviewers.
