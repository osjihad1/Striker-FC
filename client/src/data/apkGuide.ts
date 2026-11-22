// Striker FC — data/apkGuide.ts (Phase 10 fix)
// The full text of BUILD_ANDROID_APK.md (project root), mirrored verbatim so
// the in-app Settings → Android App → APK Guide modal displays the complete
// guide — not a summary or placeholder. Keep this in sync with the .md file.

export const APK_GUIDE_TEXT = `Build the Striker FC Android APK / AAB

Striker FC is a web game (React + Three.js, fixed 1/60s simulation). Capacitor wraps the production web build into a real native Android app — same code, same saves, no rewrite. This guide takes you from source to a signed APK (sideload / direct install) or AAB (Google Play) in about ten minutes.

Shipped file: this guide is BUILD_ANDROID_APK.md, shipped at the project root of the Striker FC artifact alongside capacitor.config.ts. This in-app text mirrors that file exactly — keep the two in sync when editing either one.

Configuration (from capacitor.config.ts):
• appId: com.strikerfc.app
• appName: Striker FC
• webDir: dist
• Splash background: #0b0e1a
• Android mode: full-screen immersive mode (system bars hidden during play, landscape lock — see Step 4)

0. Prerequisites
• Node.js 18 or newer — builds the web app and runs the Capacitor CLI
• npm 9 or newer (ships with Node.js) — installs Capacitor and dependencies
• Android Studio (latest stable) — compiles and signs the native app
• JDK 17 (bundled with Android Studio) — Android Gradle toolchain
• Android SDK API 34+ platform + build-tools — installed from Android Studio's SDK Manager
Install Android Studio from https://developer.android.com/studio, open it once, and let it install the default SDK before you start.

Command sequence (in order)
Run these four commands from the project root, in exactly this order:
  npm run build
  npx cap add android
  npx cap sync
  npx cap open android
(npx cap add android is first-time only; after that, every web change is just npm run build → npx cap sync → rebuild in Android Studio.)

1. Build the web app
From the project root:
  npm install
  npm run build
npm run build type-checks the whole project (tsc --noEmit) and bundles the game into dist/ — the folder capacitor.config.ts points at (webDir: "dist").
Layout note: the artifact scaffold builds the client into client/dist/. From this workspace, run the one-command prep instead — npm run apk:prep builds and copies client/dist/ to dist/ at the project root. (Equivalently: copy client/dist/ to dist/ yourself after the build, or set webDir: "client/dist" in capacitor.config.ts.) Everything else in this guide is identical.

2. Add Capacitor and the Android platform (first time only)
  npm i @capacitor/core @capacitor/android
  npm i -D @capacitor/cli
  npx cap add android
npx cap add android creates the native android/ project using the configuration already committed in capacitor.config.ts: appId com.strikerfc.app, appName Striker FC, webDir dist, splash screen background #0b0e1a (auto-hide after the web view boots), status bar overlaying the web view, and Android full-screen immersive mode (Step 4 enables it).

3. Sync the web build into the native project
Run this after every web change — it copies the fresh dist/ build and the config into the Android project:
  npx cap sync

4. Landscape lock + immersive fullscreen (one-time manifest edits)
Striker FC is a landscape game with Android full-screen immersive mode. In android/app/src/main/AndroidManifest.xml, on the main <activity> element, set:
  android:name=".MainActivity"
  android:screenOrientation="sensorLandscape"
  android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation"
  android:theme="@style/AppTheme.NoActionBarLaunch"
Then, for true immersive mode (system bars hidden during play, swipe from an edge to reveal them briefly), add to the app theme in android/app/src/main/res/values/styles.xml:
  <style name="AppTheme" parent="Theme.AppCompat.Light.NoActionBar">
      <item name="android:windowFullscreen">true</item>
      <item name="android:windowContentOverlay">@null</item>
  </style>
…and in MainActivity.java (or .kt), inside onCreate, enable sticky immersive mode:
  getWindow().getDecorView().setSystemUiVisibility(
      View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
      | View.SYSTEM_UI_FLAG_FULLSCREEN
      | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
      | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
      | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
      | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
  getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
FLAG_KEEP_SCREEN_ON matches the web build's Screen Wake Lock behaviour: the display never sleeps mid-match.
App icon and splash images go in android/app/src/main/res/ — generate the full density set from a 1024×1024 icon with Android Studio's Image Asset wizard (right-click res/ → New → Image Asset). The splash background is #0b0e1a per capacitor.config.ts.

5. Open the project in Android Studio
  npx cap open android
Wait for Gradle sync to finish. You can already run the game on a device or emulator with the green Run ▶ button (this produces a debug build).

6. Create a signed keystore / signing config
A release build must be signed. Create the keystore once and reuse it for every update:
1) In Android Studio: Build → Generate Signed Bundle / APK…
2) On the keystore step, click Create new…:
   • Key store path: pick a location outside the repo, e.g. striker-fc-release.jks, and set a strong keystore password.
   • Alias: strikerfc, and set its key password.
   • Validity (years): 25 or more (Play requires the key to outlive the app).
   • Certificate: fill in at least your name and country code.
3) Click OK. Android Studio now has a signing config for release builds.
4) Back this file and its passwords up somewhere safe. Losing the keystore means you can never update the app under the same Play listing again. On later builds, choose Choose existing… and reuse it.

7. Generate the signed APK / AAB (release)
1) In Android Studio: Build → Generate Signed Bundle / APK…
2) Choose what to build:
   • Android App Bundle (.aab) — required for the Google Play Store, or
   • APK — a single installable file for direct install / sideloading.
3) Select your keystore / signing config (Step 6) and enter its passwords.
4) Select the release build variant (not debug).
5) Check both signature versions (V1 + V2) and click Finish.
6) Outputs:
   • APK: android/app/build/outputs/apk/release/app-release.apk
   • AAB: android/app/build/outputs/bundle/release/app-release.aab

8. Install and test the release on a Pixel 6 Pro
1) On the Pixel 6 Pro: Settings → About phone → tap Build number seven times to unlock Developer options.
2) Settings → System → Developer options → enable USB debugging.
3) Connect the phone by USB and accept the debugging prompt on the phone.
4) Install the signed release APK:
   adb install android/app/build/outputs/apk/release/app-release.apk
   (For the AAB, upload it to a Play internal-testing track, or use bundletool to generate and install a device APK set.)
5) Launch Striker FC on the Pixel 6 Pro and verify:
   • The splash screen shows on the #0b0e1a background.
   • The game opens landscape-locked in full-screen immersive mode with the system bars hidden.
   • A full match holds 60 FPS (enable the FPS counter in Settings → Graphics if you want it on screen).
   • Touch controls, haptics and sound all work, and your club/save loads.
   • Storage check: play a match, earn coins, force-close the app, reopen — club, squad, coins and progress are all still there. Turn on Airplane mode and play again: everything still works and saves (Cloud Save simply waits for a connection).
6) If an older debug build is already installed with a different signature, uninstall it first (adb uninstall com.strikerfc.app) and install again.

9. iOS (same Capacitor project, Mac only)
  npm i @capacitor/ios
  npx cap add ios
  npx cap sync
  npx cap open ios
In Xcode: select your team under Signing & Capabilities, set the bundle ID to com.strikerfc.app, lock the orientation to Landscape Left/Right in the target's Deployment Info, then Product → Archive to produce the signed build for TestFlight / the App Store.

10. Storage & permissions on the phone
The installed app is deliberately boring about storage and permissions:
• Where the save lives: the WebView's IndexedDB / LocalStorage sits in the app's private internal storage (Android app-specific / scoped storage). Your club, squad, players, coins/gems, settings and progress are written there on every change, survive closing and reopening the app, and no other app can read them. The save JSON is compact (a few hundred KB at most); Settings → Data & Safety → Storage & Permissions shows the real numbers on the device.
• No storage permission — ever. Do NOT add READ_EXTERNAL_STORAGE / WRITE_EXTERNAL_STORAGE (or the Android 13+ media permissions) to the manifest: app-private storage needs none of them, and the game never touches shared storage.
• The one permission in the manifest is INTERNET (Capacitor's default). It is used only by the optional Cloud Save backup/restore in Settings. Gameplay is fully offline; with no connection the game plays and saves identically. Nothing crashes on a denied or missing permission because the game requests no runtime permissions at all.
• Notifications: never requested. Vibration: needs no permission; haptics can be turned off in Settings → Gameplay.
• Housekeeping: Settings → Data & Safety has a Clear Cache button that empties only the WebView cache stores — it can never delete the save or the settings, which live in separate storage. Textures and audio are procedural (generated at runtime), so the app ships no duplicated asset files and the cache stays small.

Troubleshooting — first sync / first build failure
Work through these in order — they cover almost every first-run failure:
1) webDir "dist" does not exist on npx cap sync — the web build has not run yet, or its output is elsewhere. Run npm run build first (Step 1), confirm dist/ exists at the project root (see the layout note in Step 1), then run npx cap sync again.
2) npx cap command not found / Capacitor CLI missing — install it with npm i -D @capacitor/cli, then re-run the failed command.
3) Gradle sync fails on JDK — Android Studio → Settings → Build Tools → Gradle → Gradle JDK must point at the bundled JDK 17. Older or newer JDKs are the most common cause of a failed first Gradle sync.
4) Gradle sync fails on SDK — open SDK Manager and install the API 34+ platform and build-tools, accept the licences, then sync again.
5) Build still fails after a config change — run npx cap sync again, then in Android Studio use File → Invalidate Caches / Restart, and rebuild. As a last resort, delete the android/ folder and redo Steps 2–5 (npx cap add android regenerates it from capacitor.config.ts).

Other issues
• Old game version inside the app — you changed the web build but forgot Step 3: run npx cap sync, then rebuild in Android Studio.
• Splash shows the wrong colour — the splash background comes from capacitor.config.ts (#0b0e1a) plus the splash drawable in res/; regenerate it with the Image Asset wizard after changing either.
• The game letterboxes instead of going fullscreen — re-check the Step 4 theme item android:windowFullscreen and the MainActivity immersive flags, then npx cap sync and rebuild.
• adb install fails with a signature mismatch — a debug build is already installed; uninstall com.strikerfc.app first (Step 8).`;
