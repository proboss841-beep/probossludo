import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Panel } from "../components/ui.jsx";
import { isInstalled, apkAvailable } from "../lib/installApp.js";

/**
 * App Download — Direct APK Download Feature.
 *
 * The Android app is just this same website inside a WebView, so every change
 * you make to the website shows up in the app automatically. Once the APK is
 * deployed to /probossludo.apk the button below downloads it; inside the app
 * itself the button is hidden (no point re-downloading an installed app).
 */
export default function AppDownload() {
  const [available, setAvailable] = useState(null); // null = checking
  const [installed, setInstalled] = useState(isInstalled());

  useEffect(() => {
    apkAvailable("/probossludo.apk").then(setAvailable).catch(() => setAvailable(false));
  }, []);

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

          <p className="text-lg font-black tracking-tight text-ink">Proboss Ludo for Android</p>

          <p className="max-w-xs text-xs font-semibold text-slate-500">
            {installed
              ? "You are already running the app — everything on the website also works in the app, and updates arrive automatically."
              : "Download the official Android app and play anywhere. Fast, secure, and smooth gameplay experience!"}
          </p>

          {!installed && available === true && (
            /* Direct APK Download Button */
            <a
              href="/probossludo.apk"
              download="probossludo.apk"
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
                Download
              </span>
            </a>
          )}

          {installed && (
            <span className="rounded-full bg-[#1a082a] px-4 py-2 text-xs font-black uppercase tracking-wide text-[#55baff] ring-1 ring-[#55baff]/50">
              ✓ Installed
            </span>
          )}

          {!installed && available === false && (
            <span className="rounded-full bg-gray-100 px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-slate-500">
              App available soon — keep playing in your browser
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