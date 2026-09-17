import type { CapacitorConfig } from '@capacitor/cli';

// Connects the native Android/iOS WebView directly to your Next.js application
// Use 'http://10.0.2.2:3000' for Android Studio Emulator
// Use 'http://192.168.0.163:3000' for a physical phone on Wi-Fi
const devServerUrl = process.env.CAPACITOR_SERVER_URL || 'http://192.168.0.163:3000';

const config: CapacitorConfig = {
  appId: 'com.tripplanner.app',
  appName: 'TripPlanner',
  webDir: 'public',
  server: {
    url: devServerUrl,
    cleartext: true,
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      overlaysWebView: true,
    },
  },
};

export default config;
