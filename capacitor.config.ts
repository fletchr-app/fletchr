import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'de.fletchr.app',
  appName: 'Archery Coach',
  webDir: 'dist',
  // Capacitor's default ('debug') logs every bridge call and result in debug builds, which
  // includes SecureStorage reads, i.e. the login tokens in plain text in logcat.
  loggingBehavior: 'none',
  // Debug build against a plain-http server on the LAN: run `CAP_ANDROID_SCHEME=http npx cap sync android`.
  ...(process.env.CAP_ANDROID_SCHEME === 'http' ? { server: { androidScheme: 'http' as const } } : {})
};

export default config;
