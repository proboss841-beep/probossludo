/**
 * Install helpers for PROBOSS LUDO.
 *
 * The site is a PWA: on Android it can be installed straight from the browser
 * as an app-like shortcut (via `beforeinstallprompt`), and on iOS users add it
 * to the home screen manually. The official Android WebView wrapper stamps a
 * "ProbossLudoApp" token into its User-Agent, and the same helper covers the
 * standalone/home-screen shortcut case so the "Download" button disappears
 * once the app is installed.
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

/* ---------------------------------------------------------------------------
 * Shared, module-level install state.
 *
 * Chrome/Edge/Android fire `beforeinstallprompt` at most ONCE per page load,
 * and only once the site is considered installable. Every component that
 * renders an Install button (the header chip, the App Download page, ...)
 * must read the same captured event — otherwise a page that mounts later
 * never sees the prompt that was already fired (and consumed) elsewhere,
 * which is exactly why the Install button used to dead-end in a useless
 * "use your browser menu" toast.
 *
 * The listeners are registered here, at module load (i.e. app startup, before
 * any component mounts), so the one-shot event is captured as early as
 * possible and is never lost.
 * ------------------------------------------------------------------------- */

let sharedPrompt = null; // the saved beforeinstallprompt event (one-shot per page)
let installInFlight = false; // guard against double prompt() calls

const promptListeners = new Set(); // (event | null) => void
const installListeners = new Set(); // () => void — installed state may have changed

function setSharedPrompt(p) {
  sharedPrompt = p;
  promptListeners.forEach((fn) => fn(p));
}

function notifyInstalledChange() {
  installListeners.forEach((fn) => fn());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // suppress the browser's automatic mini install bar
    setSharedPrompt(event);
  });
  window.addEventListener("appinstalled", () => {
    setSharedPrompt(null);
    notifyInstalledChange();
  });
}

/** React hook — re-evaluates the install state on mount, focus and install. */
export function useIsInstalled() {
  const [installed, setInstalled] = useState(isInstalled());
  useEffect(() => {
    function refresh() {
      setInstalled(isInstalled());
    }
    refresh();
    installListeners.add(refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("appinstalled", refresh);
    return () => {
      installListeners.delete(refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("appinstalled", refresh);
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
    notifyInstalledChange();
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
  const [installed, setInstalled] = useState(isInstalled());

  useEffect(() => {
    function onPrompt(p) {
      setPrompt(p);
    }
    function refreshInstalled() {
      setInstalled(isInstalled());
    }
    promptListeners.add(onPrompt);
    installListeners.add(refreshInstalled);
    refreshInstalled();
    window.addEventListener("focus", refreshInstalled);
    return () => {
      promptListeners.delete(onPrompt);
      installListeners.delete(refreshInstalled);
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

  return { prompt, install, installed };
}

/** iOS Safari never fires beforeinstallprompt — detect it for instructions. */
export function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}
