// Striker FC — capacitor.config.ts
// Capacitor wrapper configuration for the native Android (and iOS) builds.
// The web game in `dist/` is the exact same build you play in the browser —
// Capacitor packages it into a real native app: com.strikerfc.app.
// Full step-by-step instructions live in BUILD_ANDROID_APK.md.
//
// This file intentionally has no imports so it type-checks and loads even
// before `@capacitor/cli` is installed; once installed, Capacitor reads the
// default export as a CapacitorConfig.

const config = {
  appId: 'com.strikerfc.app',
  appName: 'Striker FC',
  // The production web build output folder (`npm run build`).
  webDir: 'dist',
  // App background while the web view boots — matches the splash screen.
  backgroundColor: '#0b0e1a',
  android: {
    // No cleartext traffic: the game is fully self-contained/offline.
    allowMixedContent: false,
    // Full-screen immersive play: the native shell lets the game own the
    // whole display; the matching AndroidManifest / styles edits (landscape
    // lock + immersive sticky mode) are spelled out in BUILD_ANDROID_APK.md.
    captureInput: true,
  },
  ios: {
    contentInset: 'never',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#0b0e1a',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      // The game draws under the status bar; the bar itself is hidden in
      // immersive play via the manifest theme in the guide.
      overlaysWebView: true,
      style: 'DARK',
      backgroundColor: '#0b0e1a',
    },
  },
};

export default config;
