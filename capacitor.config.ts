import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'de.fletchr.app',
  appName: 'Fletchr',
  webDir: 'dist',
  // Capacitor's default ('debug') logs every bridge call and result in debug builds, which
  // includes SecureStorage reads, i.e. the login tokens in plain text in logcat.
  loggingBehavior: 'none',
  // Only Google is used (src/lib/social-login.ts). Disabled providers are not bundled, so no Facebook SDK in the APK.
  plugins: {
    SocialLogin: { providers: { google: true, facebook: false, apple: false, twitter: false } }
  },
  // Debug build against a plain-http server on the LAN: run `CAP_ANDROID_SCHEME=http npx cap sync android`.
  ...(process.env.CAP_ANDROID_SCHEME === 'http' ? { server: { androidScheme: 'http' as const } } : {})
};

export default config;
