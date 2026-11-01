import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Panel } from "../components/ui.jsx";
import { usePwaInstall, isIOS } from "../lib/installApp.js";

/**
 * App Download — PWA install page.
 *
 * Tapping "Install" pops the browser's native install dialog and puts an
 * app-like shortcut on the home screen. On browsers that don't support the
 * install prompt (mostly iOS Safari) the page shows step-by-step "Add to Home
 * Screen" instructions instead.
 */
export default function AppDownload() {
  const { prompt, install, installed } = usePwaInstall();
  const [busy, setBusy] = useState(false);

  async function onInstall() {
    setBusy(true);
    const ok = await install();
    // if the native dialog could not be shown, fall back to instructions
    if (!ok) setBusy(false);
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

          {!installed && prompt && (
            /* Native install prompt — the browser shows its own "Install" dialog */
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

          {!installed && !prompt && <HowToInstall isIOS={isIOS()} />}

          <Link to="/" className="text-xs font-extrabold text-brand-600 hover:text-brand-500">
            ← Back to home
          </Link>
        </div>
      </Panel>
    </div>
  );
}

/** Manual install instructions for browsers without the install prompt. */
function HowToInstall({ isIOS }) {
  return (
    <div className="w-full max-w-xs space-y-3 text-left">
      {isIOS ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs">
          <p className="mb-2 font-black text-slate-700">iPhone / iPad — add to Home Screen:</p>
          <ol className="list-decimal space-y-1.5 pl-4 font-semibold text-slate-600">
            <li>
              Tap the <b>Share</b> button in Safari <span className="text-slate-400">(square with arrow)</span>.
            </li>
            <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
            <li>Tap <b>Add</b> — the app icon appears on your home screen.</li>
          </ol>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs">
          <p className="mb-2 font-black text-slate-700">Android — add to Home Screen:</p>
          <ol className="list-decimal space-y-1.5 pl-4 font-semibold text-slate-600">
            <li>
              Tap <b>⋮</b> (menu) in the top-right of Chrome.
            </li>
            <li>Tap <b>Add to Home screen</b> (or <b>Install app</b>)</li>
            <li>The app shortcut is added to your home screen.</li>
          </ol>
        </div>
      )}
    </div>
  );
}