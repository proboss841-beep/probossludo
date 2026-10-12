import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatPaise } from "../../../packages/shared/src/index.js";
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

  return (
    <section     className="flex items-center gap-2.5 border-b border-[#f41468]/30 px-4 py-2.5" data-purpose="app-header">
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
        {/* deposit balance */}
        <Link
          to="/wallet"
          aria-label="Wallet balance"
          className="flex min-w-[82px] items-center justify-center gap-1.5 rounded-full border border-sky-300/80 bg-gradient-to-b from-sky-400 via-sky-500 to-blue-600 px-3 py-2 text-white shadow-[0_0_16px_rgba(56,189,248,.45),inset_0_1px_2px_rgba(255,255,255,.45)] transition-transform active:scale-95"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5 shrink-0 drop-shadow-sm">
            <path d="M4 7.5h14.5A2.5 2.5 0 0 1 21 10v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.5Zm0 0V6a2 2 0 0 1 2-2h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M16 12h5v4h-5a2 2 0 1 1 0-4Z" fill="currentColor" fillOpacity=".22" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="17" cy="14" r=".8" fill="currentColor" />
          </svg>
          <span className="text-sm font-extrabold tracking-wide text-white drop-shadow-sm">
            {available === undefined ? "—" : formatPaise(available, { withSymbol: false })}
          </span>
        </Link>

        {/* referral (coins) balance -> redeem */}
        <Link
          to="/redeem"
          aria-label="Referral balance"
          className="flex min-w-[82px] items-center justify-center gap-1.5 rounded-full border border-sky-300/80 bg-gradient-to-b from-sky-400 via-sky-500 to-blue-600 px-3 py-2 text-white shadow-[0_0_16px_rgba(56,189,248,.45),inset_0_1px_2px_rgba(255,255,255,.45)] transition-transform active:scale-95"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5 shrink-0 drop-shadow-sm">
            <path d="M3.5 10h17v10h-17zM2.5 7h19v3h-19zM12 7v13" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            <path d="M12 7c-3.8 0-5.2-1.2-4.4-2.7C8.8 2.2 11.3 4.8 12 7Zm0 0c3.8 0 5.2-1.2 4.4-2.7C15.2 2.2 12.7 4.8 12 7Z" fill="currentColor" fillOpacity=".35" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          <span className="text-sm font-extrabold tracking-wide text-white drop-shadow-sm">
            {formatPaise(wallet?.referralPaise ?? 0, { withSymbol: false })}
          </span>
        </Link>
      </div>
    </section>
  );
}

function Drawer({ open, onClose }) {
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
          {DRAWER_ITEMS.map((item) => (
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
          <Route path="/battle" element={<Battle />} />
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
