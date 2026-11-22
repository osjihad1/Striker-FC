// Striker FC — core/OrientationLock.ts
// Landscape-first launch lock. Striker FC is a landscape game: on the
// native APK the Capacitor ScreenOrientation plugin locks the activity to
// landscape (with the AndroidManifest sensorLandscape attribute as the
// hard backstop), and on the web the Screen Orientation API is attempted —
// it is silently refused where the browser demands fullscreen + a user
// gesture, in which case the in-match rotate hint stays as the fallback.
// Retries are allowed until a lock actually succeeds, because the first
// web attempt (at app mount, before any tap) is exactly the one Chrome
// refuses; entering a match follows a tap, so it can succeed there.

import { Capacitor } from "@capacitor/core";

let locked = false;

export function lockLandscape(): void {
  if (locked) return;
  void (async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        const { ScreenOrientation } = await import("@capacitor/screen-orientation");
        await ScreenOrientation.lock({ orientation: "landscape" });
        locked = true;
        return;
      }
    } catch {
      /* Plugin unavailable in this build — fall through to the web API. */
    }
    try {
      const orientation = window.screen?.orientation as
        | (ScreenOrientation & { lock?: (orientation: string) => Promise<void> })
        | undefined;
      if (orientation?.lock) {
        await orientation.lock("landscape");
        locked = true;
      }
    } catch {
      /* Refused (no gesture yet / not fullscreen) — a later tap retries. */
    }
  })();
}
