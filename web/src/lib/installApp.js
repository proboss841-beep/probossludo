/**
 * Install helpers for PROBOSS LUDO.
 *
 * The site is a PWA: on Android it can be installed straight from the browser
 * as an app-like shortcut (via `beforeinstallprompt`), and on iOS users add it
 * to the home screen manually. The official Android WebView wrapper stamps a
 * "ProbossLudoApp" token into its User-Agent, and the same helper covers the
 * standalone/home-screen shortcut case so the "Download" button disappears
 * once the app is installed.
 *
 * Installed state is device-aware: Chrome Android's getInstalledRelatedApps()
 * lets us see the PWA even from a plain browser tab (beforeinstallprompt never
 * fires once the app is on the phone), so the Install button / popup never
 * dead-ends in "Install popup didn't open" for users who already installed.
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

/** has the app already been installed on this device (wrapper or standalone)? */
export function isInstalled() {
  return isInApp() || isStandalone();
}

/**
 * Detect the installed PWA even from a plain browser tab.
 *
 * Chrome Android's navigator.getInstalledRelatedApps() reports an installed
 * web-app entry for the current origin — which is exactly the case where the
 * browser will NOT fire `beforeinstallprompt` (the app is already installed),
 * so the old code had no way to know and the Install button failed.
 * Returns false on browsers that don't support the API (iOS, older Chrome).
 */
export async function detectInstalledWebApp() {
  if (typeof navigator === "undefined" || typeof navigator.getInstalledRelatedApps !== "function") {
    return false;
  }
  try {
    const apps = await navigator.getInstalledRelatedApps();
    return apps.some((app) => app.platform === "webapp");
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------------------
 * Shared, module-level install state.
 *
 * Chrome/Edge/Android fire `beforeinstallprompt` at most ONCE per page load,
 * and only once the site is considered installable. Every component that
 * renders an Install button (the header chip, the App Download page, the
 * Download popup, ...) must read the same captured event and the same
 * device-level installed status — otherwise a component that mounts later
 * never sees what another one already captured.
 *
 * The listeners are registered here, at module load (i.e. app startup, before
 * any component mounts), so the one-shot event is captured as early as
 * possible and is never lost.
 * ------------------------------------------------------------------------- */

let sharedPrompt = null; // the saved beforeinstallprompt event (one-shot per page)
let installInFlight = false; // guard against double prompt() calls
let sharedInstalled = isInstalled(); // device-level installed status
let deviceCheckDone = false; // first async getInstalledRelatedApps() finished?

const promptListeners = new Set(); // (event | null) => void
const installListeners = new Set(); // (installed: boolean) => void

function setSharedPrompt(p) {
  sharedPrompt = p;
  promptListeners.forEach((fn) => fn(p));
}

function emitInstalled(installed) {
  sharedInstalled = installed;
  installListeners.forEach((fn) => fn(installed));
}

/** Re-run every device-level installed check (wrapper / standalone / PWA). */
export async function refreshInstalled() {
  if (typeof window === "undefined") return sharedInstalled;
  const nowInstalled = isInstalled() || (await detectInstalledWebApp());
  if (!deviceCheckDone || nowInstalled !== sharedInstalled) {
    deviceCheckDone = true;
    emitInstalled(nowInstalled);
  }
  return nowInstalled;
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // suppress the browser's automatic mini install bar
    setSharedPrompt(event);
  });
  window.addEventListener("appinstalled", () => {
    setSharedPrompt(null);
    emitInstalled(true);
  });
  // run the device-level check as soon as the app boots (from a plain browser
  // tab it reveals an already-installed PWA that beforeinstallprompt never
  // signals), and re-check whenever the user comes back to the tab.
  refreshInstalled();
  window.addEventListener("focus", refreshInstalled);
  document.addEventListener("visibilitychange", () => {
    if (typeof document !== "undefined" && !document.hidden) refreshInstalled();
  });
}

/** React hook — device-level install state (re-evaluated on mount/focus). */
export function useIsInstalled() {
  const [installed, setInstalled] = useState(sharedInstalled);
  useEffect(() => {
    function onInstalled(i) {
      setInstalled(i);
    }
    installListeners.add(onInstalled);
    refreshInstalled();
    window.addEventListener("focus", refreshInstalled);
    return () => {
      installListeners.delete(onInstalled);
      window.removeEventListener("focus", refreshInstalled);
    };
  }, []);
  return installed;
}

async function showPrompt(evt) {
  installInFlight = true;
  try {
    evt.prompt();
  } catch {
    installInFlight = false;
    setSharedPrompt(null);
    return { shown: false, outcome: null };
  }
  let outcome = "";
  try {
    const choice = await evt.userChoice;
    outcome = choice && choice.outcome ? choice.outcome : "";
  } catch {
    // some browsers reject userChoice — treat as shown with unknown outcome
  }
  installInFlight = false;
  // One-shot event — the browser will not fire another beforeinstallprompt in
  // this page session, so drop it for everyone.
  setSharedPrompt(null);
  if (outcome === "accepted") {
    // `appinstalled` follows immediately; this keeps the UI in sync right now.
    emitInstalled(true);
  }
  return { shown: true, outcome: outcome || "unknown" };
}

/**
 * PWA install — every Install button in the app shares one source of truth
 * (the module-level `sharedPrompt`), so whichever button the user taps gets
 * the browser's native "Install" dialog.
 *
 * `install({ waitMs })` shows the native dialog straight away when the browser
 * has signalled installability. Otherwise it waits up to `waitMs` for the
 * signal — Android Chrome usually fires `beforeinstallprompt` right after the
 * first tap on the page — before giving up. Always call from a user-gesture
 * handler. Resolves with:
 *   { shown: true,  outcome: "accepted" | "dismissed" | "unknown" }
 *   { shown: false, outcome: null }
 */
export function usePwaInstall() {
  const [prompt, setPrompt] = useState(sharedPrompt);
  const [installed, setInstalled] = useState(sharedInstalled);
  const [checking, setChecking] = useState(!deviceCheckDone);

  useEffect(() => {
    function onPrompt(p) {
      setPrompt(p);
    }
    function onInstalled(i) {
      setInstalled(i);
      setChecking(false);
    }
    promptListeners.add(onPrompt);
    installListeners.add(onInstalled);
    refreshInstalled().then(() => setChecking(false));
    window.addEventListener("focus", refreshInstalled);
    return () => {
      promptListeners.delete(onPrompt);
      installListeners.delete(onInstalled);
      window.removeEventListener("focus", refreshInstalled);
    };
  }, []);

  const install = async (opts = {}) => {
    const waitMs = opts.waitMs != null ? opts.waitMs : 5000;
    if (installInFlight) return { shown: false, outcome: null };

    const evt = prompt || sharedPrompt;
    if (evt && typeof evt.prompt === "function") {
      return showPrompt(evt);
    }

    // Browser has not signalled installability yet — give it a short window
    // (the event usually fires around the user's first interaction).
    const got = await new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => settle(null), waitMs);
      function onPrompt(p) {
        if (p && typeof p.prompt === "function") settle(p);
      }
      function settle(p) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        promptListeners.delete(onPrompt);
        resolve(p || null);
      }
      promptListeners.add(onPrompt);
      if (sharedPrompt && typeof sharedPrompt.prompt === "function") {
        settle(sharedPrompt);
      }
    });

    if (!got) return { shown: false, outcome: null };
    return showPrompt(got);
  };

  return { prompt, install, installed, checking };
}

/** iOS Safari never fires beforeinstallprompt — detect it for instructions. */
export function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}
