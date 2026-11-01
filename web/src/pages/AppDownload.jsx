import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Panel } from "../components/ui.jsx";
import { usePwaInstall } from "../lib/installApp.js";
import { useToast } from "../components/Toast.jsx";

/**
 * App Download — PWA install page.
 *
 * The big Install button is always shown unless the app is already installed.
 * On browsers that support it the button opens the browser's native install
 * dialog ("Install" popup). If the browser does not offer the prompt right now
 * (iOS Safari, or Chrome right after the app was uninstalled), tapping it shows
 * a short toast instead — the button is never hidden.
 */
export default function AppDownload() {
  const { prompt, install, installed } = usePwaInstall();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function onInstall() {
    if (!prompt) {
      toast.info("Use your browser menu (⋮) → Install app / Add to Home screen");
      return;
    }
    setBusy(true);
    const ok = await install();
    if (!ok) {
      toast.info("Use your browser menu (⋮) → Install app / Add to Home screen");
      setBusy(false);
    }
  }

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
              className="mt-2 inline-flex flex-col items-center justify-center rounded-full border-2 border-[#1E1E1E] bg-[#FEF0B6] px-6 py-2 shadow-md transition-all hover:brightness-95 active:scale-95 cursor-pointer"
            >
              {/* Green Circle Badge with Live Bouncing Download Icon */}
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#48C79C] text-white animate-bounce shadow-sm">
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
              </div>

              {/* Text Label Stacked Below Arrow */}
              <span className="mt-1 text-xs font-black tracking-tight text-[#1E1E1E]">
                Install
              </span>
            </button>
          )}

          {installed && (
            <span className="rounded-full bg-[#1a082a] px-4 py-2 text-xs font-black uppercase tracking-wide text-[#55baff] ring-1 ring-[#55baff]/50">
              ✓ Installed
            </span>
          )}

          <Link to="/" className="text-xs font-extrabold text-brand-600 hover:text-brand-500">
            ← Back to home
          </Link>
        </div>
      </Panel>
    </div>
  );
}