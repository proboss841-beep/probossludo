import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePwaInstall } from "../lib/installApp.js";

/**
 * Download-the-app prompt — a centred modal shown on every page load while the
 * app is NOT installed on the device (wrapper, standalone PWA, or the installed
 * PWA detected via getInstalledRelatedApps).
 *
 *  - Appears on every page reload until the app is installed; dismissing it
 *    with the cross only closes it for the current session.
 *  - "Download App" opens the browser's native Android install popup; only if
 *    the browser refuses right now it goes to the full download page instead.
 */
export default function DownloadAppPopup() {
  const navigate = useNavigate();
  const { install, installed, checking } = usePwaInstall();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  // Show once the device-level installed check has settled and the app is
  // not installed (the check avoids flashing the popup for installed users).
  useEffect(() => {
    if (!checking && !installed) setVisible(true);
  }, [checking, installed]);

  async function handleDownload() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await install({ waitMs: 3500 });
      if (result.shown) {
        setVisible(false);
        return;
      }
      // not installable right now → full download page (it retries + explains)
      setVisible(false);
      navigate("/app-download");
    } finally {
      setBusy(false);
    }
  }

  if (!visible || installed) return null;

  return (
    // centred in the viewport over a dimmed backdrop
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-sm rounded-3xl border border-[#f41468]/50 bg-[#160522] p-7 text-center shadow-[0_22px_60px_rgba(0,0,0,.6)]">
        {/* cross close icon — dismiss for this session only */}
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label="Dismiss download prompt"
          className="absolute -top-2.5 -right-2.5 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/40 transition hover:bg-rose-500/40 active:scale-90"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <img
          src="/logo.png"
          alt="Proboss Ludo"
          className="mx-auto h-24 w-24 rounded-3xl bg-white/5 object-contain p-2 shadow-inner ring-1 ring-[#f41468]/40"
        />

        <h3 className="mt-4 text-lg font-black tracking-tight text-ink">Download the Proboss Ludo app</h3>

        <p className="mt-1.5 text-xs font-semibold leading-relaxed text-slate-400">
          Play anywhere — it lives on your home screen, opens full-screen like a
          real app, and stays updated automatically.
        </p>

        <button
          type="button"
          onClick={handleDownload}
          disabled={busy}
          className="mt-6 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border-2 border-[#1E1E1E] bg-[#FEF0B6] px-6 py-3 text-sm font-black tracking-tight text-[#1E1E1E] shadow-md transition-all hover:brightness-95 active:scale-95 disabled:cursor-wait disabled:opacity-70"
        >
          {busy ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#1E1E1E] border-t-transparent" aria-hidden="true" />
          ) : (
            <svg className="h-4 w-4 stroke-[3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          )}
          {busy ? "Opening…" : "Download App"}
        </button>
      </div>
    </div>
  );
}
