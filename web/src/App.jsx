import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { subscribe, tryResume, authState } from "./lib/auth.js";
import { api } from "./lib/api.js";
import Home from "./pages/Home.jsx";
import Play from "./pages/Play.jsx";
import Battle from "./pages/Battle.jsx";
import Wallet from "./pages/Wallet.jsx";
import Profile from "./pages/Profile.jsx";
import Kyc from "./pages/Kyc.jsx";
import Login from "./pages/Login.jsx";
import Support from "./pages/Support.jsx";
import Refer from "./pages/Refer.jsx";
import ReferHistory from "./pages/ReferHistory.jsx";
import History from "./pages/History.jsx";
import Redeem from "./pages/Redeem.jsx";
import AppDownload from "./pages/AppDownload.jsx";
import { Spinner } from "./components/ui.jsx";
import { NavIcon } from "./components/art.jsx";
import { formatPaise } from "./lib/money.js";
import { useIsInstalled, usePwaInstall } from "./lib/installApp.js";

/**
 * App shell uses a centred, reference-style device frame
 * column (centred on desktop, full-bleed on mobile). The header now carries the
 * app logo, the deposit balance chip and the referral (coins) chip plus the
 * navigation drawer with every option the reference sidebar had.
 */

const NAV = [
  { to: "/support", label: "Support", icon: "support" },
  { to: "/refer", label: "Refer", icon: "gift" },
  { to: "/", label: "Home", icon: "home" },
  { to: "/wallet", label: "Wallet", icon: "wallet" },
  { to: "/profile", label: "Profile", icon: "user" },
];

const DRAWER_ITEMS = [
  { to: "/profile", label: "My Profile", icon: "user", tone: "text-blue-600" },
  { to: "/play", label: "Play Game", icon: "play", tone: "text-indigo-600" },
  { to: "/wallet", label: "My Wallet", icon: "wallet", tone: "text-emerald-600" },
  { to: "/refer", label: "Refer and Earn", icon: "gift", tone: "text-amber-600" },
  { to: "/history", label: "History", icon: "history", tone: "text-purple-600" },
  { to: "/refer-history", label: "Refer History", icon: "list", tone: "text-teal-600" },
  { to: "/support", label: "Support", icon: "support", tone: "text-rose-600" },
  { to: "/app-download", label: "App Download", icon: "download", tone: "text-sky-600" },
];

function useWalletView() {
  const { data } = useQuery({ queryKey: ["wallet"], queryFn: () => api("/wallet") });
  return data;
}

function AppHeader({ onOpenMenu }) {
  const wallet = useWalletView();
  const available = wallet?.availablePaise;
  const installed = useIsInstalled();
  const { prompt: installPrompt, install: installPwa } = usePwaInstall();

  /** Download/Install click — when the browser offers a PWA install prompt,
   * show the native popup right here; otherwise go to the download page,
   * which retries and only then falls back (never browser-menu instructions). */
  async function onDownloadClick(e) {
    if (installPrompt) {
      e.preventDefault();
      await installPwa();
    }
  }

  return (
    <section className="flex items-center gap-2 border-b border-[#f41468]/30 px-3 py-2.5" data-purpose="app-header">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Open menu"
        className="menu-toggle-button flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white transition-all active:scale-95"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 stroke-current" fill="none" viewBox="0 0 24 24" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <Link to="/" aria-label="Proboss Ludo home" className="flex items-center transition-transform active:scale-95">
        <img src="/logo.png" alt="Proboss Ludo" className="h-10 w-10 object-contain drop-shadow-[0_0_10px_rgba(244,20,104,.25)]" />
      </Link>

      <div className="ml-auto flex items-center gap-1.5">
        {/* Download Button: Stacked layout (Arrow on top, text underneath), wallet gradient color, animated green arrow.
            Hidden once the app (Android wrapper / PWA shortcut) is installed.
            With PWA support it opens the browser install dialog; otherwise it
            goes to the download page with Add-to-Home-Screen instructions. */}
        {!installed && (
          <Link
            to="/app-download"
            onClick={onDownloadClick}
            aria-label="Download App"
            className="flex flex-col items-center justify-center rounded-2xl border border-sky-300/80 bg-gradient-to-b from-sky-400 via-sky-500 to-blue-600 px-2.5 py-1 text-white shadow-[0_0_10px_rgba(56,189,248,.35)] transition-transform active:scale-95"
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#10b981] text-white animate-bounce shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5 stroke-[3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </span>
            <span className="text-[10px] font-extrabold tracking-tight text-white drop-shadow-sm leading-tight mt-0.5">
              Download
            </span>
          </Link>
        )}

        {/* Compact Deposit balance chip */}
        <Link
          to="/wallet"
          aria-label="Wallet balance"
          className="flex min-w-[68px] items-center justify-center gap-1 rounded-full border border-sky-300/80 bg-gradient-to-b from-sky-400 via-sky-500 to-blue-600 px-2 py-1.5 text-white shadow-[0_0_10px_rgba(56,189,248,.35)] transition-transform active:scale-95"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0 drop-shadow-sm">
            <path d="M4 7.5h14.5A2.5 2.5 0 0 1 21 10v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.5Zm0 0V6a2 2 0 0 1 2-2h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M16 12h5v4h-5a2 2 0 1 1 0-4Z" fill="currentColor" fillOpacity=".22" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="17" cy="14" r=".8" fill="currentColor" />
          </svg>
          <span className="text-xs font-extrabold tracking-wide text-white drop-shadow-sm">
            {available === undefined ? "—" : formatPaise(available, { withSymbol: false })}
          </span>
        </Link>

        {/* Compact Referral balance chip */}
        <Link
          to="/redeem"
          aria-label="Referral balance"
          className="flex min-w-[68px] items-center justify-center gap-1 rounded-full border border-sky-300/80 bg-gradient-to-b from-sky-400 via-sky-500 to-blue-600 px-2 py-1.5 text-white shadow-[0_0_10px_rgba(56,189,248,.35)] transition-transform active:scale-95"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0 drop-shadow-sm">
            <path d="M3.5 10h17v10h-17zM2.5 7h19v3h-19zM12 7v13" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            <path d="M12 7c-3.8 0-5.2-1.2-4.4-2.7C8.8 2.2 11.3 4.8 12 7Zm0 0c3.8 0 5.2-1.2 4.4-2.7C15.2 2.2 12.7 4.8 12 7Z" fill="currentColor" fillOpacity=".35" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          <span className="text-xs font-extrabold tracking-wide text-white drop-shadow-sm">
            {formatPaise(wallet?.referralPaise ?? 0, { withSymbol: false })}
          </span>
        </Link>
      </div>
    </section>
  );
}

function ledgerKind(row) {
  if (row.type === "deposit") return { label: "Deposit", cls: "bg-emerald-100 text-emerald-700" };
  if (["withdrawal_hold", "withdrawal_paid", "withdrawal_refund"].includes(row.type)) {
    return { label: "Withdraw", cls: "bg-rose-100 text-rose-700" };
  }
  if (row.type === "admin_adjustment" && row.amountPaise < 0) return { label: "Penalty", cls: "bg-rose-100 text-rose-700" };
  if (row.type === "admin_adjustment" && row.amountPaise > 0) return { label: "Bonus", cls: "bg-emerald-100 text-emerald-700" };
  if (["referral_commission", "referral_bonus"].includes(row.type)) return { label: "Bonus", cls: "bg-emerald-100 text-emerald-700" };
  if (row.type === "referral_redeem") return { label: "Withdraw", cls: "bg-rose-100 text-rose-700" };
  return { label: "Other", cls: "bg-slate-100 text-slate-600" };
}

/** Compact deposit / withdraw / bonus / penalty history inside the sidebar. */
function DrawerHistory({ open, onClose }) {
  const { data } = useQuery({
    queryKey: ["wallet", "history", "drawer"],
    queryFn: () => api("/wallet/history?limit=6"),
    enabled: open,
    refetchInterval: 30_000,
  });
  const rows = data?.items || [];
  if (rows.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">Recent activity</p>
        <Link
          to="/history"
          onClick={onClose}
          className="text-[11px] font-bold text-brand-600 hover:underline"
        >
          View all
        </Link>
      </div>
      <ul className="space-y-1.5">
        {rows.map((row) => {
          const kind = ledgerKind(row);
          const signed = Number(row.amountPaise) !== 0;
          return (
            <li key={row.id} className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase ${kind.cls}`}>
                  {kind.label}
                </span>
                <span className="truncate text-[11px] text-slate-500">{row.note || row.type}</span>
              </div>
              {signed ? (
                <span className={`shrink-0 text-[11px] font-black ${Number(row.amountPaise) > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {Number(row.amountPaise) > 0 ? "+" : "−"}
                  {formatPaise(Math.abs(row.amountPaise), { withSymbol: false })}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Drawer({ open, onClose }) {
  // hide the "App Download" entry when already running inside the app / PWA
  const installed = useIsInstalled();
  const drawerItems = installed
    ? DRAWER_ITEMS.filter((i) => i.to !== "/app-download")
    : DRAWER_ITEMS;

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] transition-opacity"
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[80%] flex-col bg-slate-50 shadow-2xl transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Proboss Ludo" className="h-8 w-8 object-contain" />
            <h2 className="text-base font-black tracking-tight text-slate-800">Menu</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-xl p-1.5 text-slate-500 transition-colors hover:bg-slate-200/60"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 space-y-2.5 overflow-y-auto p-4">
          {drawerItems.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              onClick={onClose}
              className="group flex w-full items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm transition-all hover:border-brand-500/60 hover:shadow-md active:scale-[0.98]"
            >
              <span className="flex items-center gap-3">
                <span className="rounded-xl border border-slate-100 bg-slate-50 p-2 transition-colors group-hover:bg-brand-500/10">
                  <NavIcon name={item.icon} className={`h-5 w-5 ${item.tone}`} />
                </span>
                <span className="text-sm font-bold text-slate-700 group-hover:text-slate-900">{item.label}</span>
              </span>
              <svg className="h-4 w-4 text-slate-400 transition-all group-hover:translate-x-1 group-hover:text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}

          <DrawerHistory open={open} onClose={onClose} />
        </nav>
      </aside>
    </>
  );
}

function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-center">
      <div className="w-full max-w-[650px] border-t border-gray-200 bg-white/95 backdrop-blur">
        <div className="grid grid-cols-5">
          {NAV.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-bold transition-colors ${
                  active ? "text-brand-600" : "text-slate-400 hover:text-slate-600"
                }`}
              >
                <NavIcon name={item.icon} className="h-6 w-6" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

export default function App() {
  const [auth, setAuth] = useState(authState());
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    tryResume();
    return subscribe(setAuth);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  if (!auth.ready) {
    return (
      <div className="player-app flex min-h-screen w-full max-w-[650px] items-center justify-center shadow-2xl">
        <Spinner />
      </div>
    );
  }

  if (!auth.user) {
    return (
      <div className="player-app flex min-h-screen w-full max-w-[650px] flex-col shadow-2xl">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </div>
    );
  }

  return (
    <div className="player-app relative flex min-h-screen w-full max-w-[650px] flex-col shadow-2xl">
      <AppHeader onOpenMenu={() => setMenuOpen(true)} />
      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} />
      <main className="flex-1 space-y-4 px-4 pb-28 pt-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/play" element={<Play />} />
          <Route path="/battle" element={<Play />} />
          <Route path="/battle/:id" element={<Battle />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/kyc" element={<Kyc />} />
          <Route path="/support" element={<Support />} />
          <Route path="/refer" element={<Refer />} />
          <Route path="/refer-history" element={<ReferHistory />} />
          <Route path="/history" element={<History />} />
          <Route path="/redeem" element={<Redeem />} />
          <Route path="/app-download" element={<AppDownload />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}