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

/** React hook — re-evaluates the install state on mount and on focus. */
export function useIsInstalled() {
  const [installed, setInstalled] = useState(isInstalled());
  useEffect(() => {
    function refresh() {
      setInstalled(isInstalled());
    }
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("appinstalled", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("appinstalled", refresh);
    };
  }, []);
  return installed;
}

/**
 * PWA install — captures the browser's `beforeinstallprompt` event and returns
 * an `install()` function that shows the native "Install" confirmation dialog.
 *
 * `prompt` is non-null only when the browser (Chrome/Edge/Brave on Android and
 * desktop) considers the site installable. iOS Safari never fires it — those
 * users follow the Add-to-Home-Screen instructions instead.
 */
export function usePwaInstall() {
  const [prompt, setPrompt] = useState(null);
  const [installed, setInstalled] = useState(isInstalled());

  useEffect(() => {
    function onPrompt(event) {
      event.preventDefault(); // don't auto-show the browser's mini bar
      setPrompt(event);
    }
    function onInstalled() {
      setPrompt(null);
      setInstalled(true);
    }
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  /** shows the native install dialog — call from a user-gesture handler only */
  async function install() {
    if (!prompt) return false;
    prompt.prompt();
    await prompt.userChoice;
    setPrompt(null);
    setInstalled(isInstalled());
    return isInstalled();
  }

  return { prompt, install, installed };
}

/** iOS Safari never fires beforeinstallprompt — detect it for instructions. */
export function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}