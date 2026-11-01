import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Panel } from "../components/ui.jsx";
import { usePwaInstall } from "../lib/installApp.js";

/**
 * App Download — PWA install page.
 *
 * The big Install button is always shown unless the app is already installed.
 * Tapping it opens the browser's NATIVE install dialog ("Install" popup) —
 * the event is captured app-wide (see installApp.js), so the popup appears
 * even when you land on this page after the browser already signalled
 * installability elsewhere. If the browser refuses the prompt right now, the
 * page waits briefly for it (Chrome fires beforeinstallprompt after the first
 * tap) and only if it truly never arrives shows a short inline note — we never
 * send the user hunting in the browser menu.
 */
export default function AppDownload() {
  const { prompt, install, installed } = usePwaInstall();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function onInstall() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const result = await install();
    setBusy(false);
    if (!result.shown) setFailed(true);
  }

  // If the first tap happened before the browser signalled installability,
  // auto-open the native dialog the instant the signal arrives — the user's
  // tap is still a fresh gesture at that moment, so Chrome accepts it.
  useEffect(() => {
    if (!failed || !prompt || busy) return;
    let cancelled = false;
    setBusy(true);
    setFailed(false);
    install().then((result) => {
      if (cancelled) return;
      setBusy(false);
      if (!result.shown) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, failed]);

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Download the Proboss Ludo app">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          {/* Proboss Logo */}
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-900/5 p-2 shadow-inner">
            <img
              src="/logo.png"
              alt="Proboss Ludo"
              className="h-full w-full object-contain drop-shadow-[0_0_12px_rgba(244,20,104,.3)]"
            />
          </div>

          <p className="text-lg font-black tracking-tight text-ink">Proboss Ludo</p>

          <p className="max-w-xs text-xs font-semibold text-slate-500">
            {installed
              ? "You already have the app installed — everything on the website works in the app, and updates arrive automatically."
              : "Install the app on your phone — it lives on your home screen, opens full-screen like a real app, and stays updated automatically."}
          </p>

          {!installed && (
            /* Install button — always visible; opens the native install dialog
               when the browser supports it */
            <button
              type="button"
              onClick={onInstall}
              disabled={busy}
              className="mt-2 inline-flex flex-col items-center justify-center rounded-full border-2 border-[#1E1E1E] bg-[#FEF0B6] px-6 py-2 shadow-md transition-all hover:brightness-95 active:scale-95 cursor-pointer disabled:cursor-wait disabled:opacity-70"
            >
              {/* Green Circle Badge with Live Bouncing Download Icon */}
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#48C79C] text-white animate-bounce shadow-sm">
                {busy ? (
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
                  </svg>
                ) : (
                  <svg
                    className="h-4 w-4 stroke-[3]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2.5"
                      d="M19 14l-7 7m0 0l-7-7m7 7V3"
                    />
                  </svg>
                )}
              </div>

              {/* Text Label Stacked Below Arrow */}
              <span className="mt-1 text-xs font-black tracking-tight text-[#1E1E1E]">
                {busy ? "Preparing…" : "Install"}
              </span>
            </button>
          )}

          {installed && (
            <span className="rounded-full bg-[#1a082a] px-4 py-2 text-xs font-black uppercase tracking-wide text-[#55baff] ring-1 ring-[#55baff]/50">
              ✓ Installed
            </span>
          )}

          {/* Only shown when the browser genuinely refuses the native prompt —
              never points the user at the browser menu. */}
          {failed && (
            <p className="max-w-xs text-xs font-semibold text-amber-600">
              Install popup didn't open — close this page, reopen it, and tap Install again.
            </p>
          )}

          <Link to="/" className="text-xs font-extrabold text-brand-600 hover:text-brand-500">
            ← Back to home
          </Link>
        </div>
      </Panel>
    </div>
  );
}
