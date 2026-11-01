/**
 * App / install helpers for the PROBOSS LUDO wrapper.
 *
 * The Android app is a thin WebView that loads this same website and stamps a
 * "ProbossLudoApp" token into its User-Agent. Detecting it lets the UI hide the
 * "Download App" button for people who already have the app installed — and the
 * same helper covers the PWA "Add to Home Screen" shortcut case.
 */
import { useEffect, useState } from "react";

/** are we running inside the official Android WebView app? */
export function isInApp() {
  if (typeof navigator === "undefined") return false;
  return /ProbossLudoApp/i.test(navigator.userAgent);
}

/** running as an installed PWA shortcut / standalone web app? */
export function isStandalone() {
  if (typeof window === "undefined") return false;
  if (window.navigator?.standalone === true) return true;
  return Boolean(window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
}

/** has the app already been installed on this device (either wrapper or PWA)? */
export function isInstalled() {
  return isInApp() || isStandalone();
}

/** React hook — re-evaluates the install state on mount and on focus. */
export function useIsInstalled() {
  const [installed, setInstalled] = useState(isInstalled());
  useEffect(() => {
    function refresh() {
      setInstalled(isInstalled());
    }
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  return installed;
}

/**
 * Does the APK exist on this deployment? The public/ directory serves it at
 * /app.apk once the android/build-apk.sh output is deployed; before that the
 * download page should say "coming soon" instead of a dead button.
 */
export async function apkAvailable() {
  try {
    const res = await fetch("/app.apk", { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}