import type { CapacitorConfig } from '@capacitor/cli';

// Determines the remote or local server URL for the WebView.
// - In CI or production builds, specify CAPACITOR_SERVER_URL (e.g., your deployed Vercel URL)
// - In development, defaults to local machine IP for live reload
// - If no server URL is provided in production, server is omitted to prevent baking in private LAN IPs
const serverUrl =
  process.env.CAPACITOR_SERVER_URL ||
  (process.env.NODE_ENV === 'development' ? 'http://192.168.0.163:3000' : undefined);

const config: CapacitorConfig = {
  appId: 'com.tripplanner.app',
  appName: 'TripPlanner',
  webDir: 'public',
  server: serverUrl
    ? {
        url: serverUrl,
        cleartext: serverUrl.startsWith('http://'),
      }
    : undefined,
  ios: {
    includePlugins: [
      '@capacitor-community/keep-awake',
      '@capacitor/geolocation',
      '@capacitor/haptics',
      '@capacitor/local-notifications',
      '@capacitor/status-bar',
    ],
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      overlaysWebView: true,
    },
  },
};

export default config;

