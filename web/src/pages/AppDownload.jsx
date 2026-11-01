import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Panel } from "../components/ui.jsx";
import { isInstalled, isInApp, apkAvailable } from "../lib/installApp.js";

/**
 * App Download — installs the PROBOSS LUDO Android wrapper (APK).
 *
 * The app is just this same website inside a WebView, so every change you make
 * to the website shows up in the app automatically. Once the APK is deployed
 * to /app.apk the button below downloads it; inside the app itself the button
 * is hidden (no point re-downloading an installed app).
 */
export default function AppDownload() {
  const [available, setAvailable] = useState(null); // null = checking
  const [installed, setInstalled] = useState(isInstalled());

  useEffect(() => {
    apkAvailable().then(setAvailable).catch(() => setAvailable(false));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Download the Proboss Ludo app">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <img src="/logo.png" alt="Proboss Ludo" className="h-20 w-20 object-contain drop-shadow-[0_0_14px_rgba(244,20,104,.35)]" />
          <p className="text-lg font-black tracking-tight text-ink">Proboss Ludo for Android</p>
          <p className="max-w-xs text-xs font-semibold text-slate-500">
            {installed
              ? "You are already running the app — everything on the website also works in the app, and updates arrive automatically."
              : "Download the app and play anywhere. Deposits and withdrawals work exactly like the website."}
          </p>

          {!installed && available !== false && (
            <a
              href="/app.apk"
              download
              className="mt-1 inline-flex items-center gap-2 rounded-full bg-[#55baff] px-8 py-3 text-sm font-extrabold uppercase tracking-wide text-[#1a082a] shadow-[0_0_18px_rgba(85,186,255,.45)] transition-all hover:bg-[#36a9f7] active:scale-95"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0 0l-4.5-4.5M12 16l4.5-4.5M4 20h16" />
              </svg>
              Download App
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