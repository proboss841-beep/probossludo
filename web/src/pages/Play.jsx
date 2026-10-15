import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { socket } from "../lib/socket.js";
import { computePrize, formatPaise, rupeesToPaise } from "../lib/money.js";
import { useToast } from "../components/Toast.jsx";
import { Button, Empty, SectionTitle, Skeleton } from "../components/ui.jsx";

const MAX_SEARCHING_BATTLES = 2;
const MIN_AMOUNT = 50;
const MAX_AMOUNT = 100000;
const AMOUNT_STEP = 50;

const ACTIVE_STATUSES = ["join_requested", "running", "room_submitted", "result_submitted", "cancel_requested"];
const RUNNING_STATUSES = ["running", "room_submitted", "result_submitted", "cancel_requested"];
const DEMO_NAME_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DEMO_STAKES_RUPEES = [50, 100, 150, 200, 250, 300, 500, 750, 1000, 1500, 2000, 2500, 5000];

const creatorOf = (c) => c?.players?.find((p) => p.seat === 1) || null;
const opponentOf = (c) => c?.players?.find((p) => p.seat === 2) || null;
const isMine = (c) => Boolean(c?.players?.some((p) => p.isYou));

export default function Play() {
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [betAmount, setBetAmount] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [createError, setCreateError] = useState("");
  const [demoHour, setDemoHour] = useState(() => Math.floor(Date.now() / 3_600_000));
  const [demoNotice, setDemoNotice] = useState("");

  useEffect(() => {
    const interval = window.setInterval(() => {
      setDemoHour(Math.floor(Date.now() / 3_600_000));
    }, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!demoNotice) return undefined;
    const timeout = window.setTimeout(() => setDemoNotice(""), 3_500);
    return () => window.clearTimeout(timeout);
  }, [demoNotice]);

  const open = useQuery({
    queryKey: ["contests", "open"],
    queryFn: () => api("/contests/open"),
    refetchInterval: 15_000,
  });
  const mine = useQuery({
    queryKey: ["contests", "mine"],
    queryFn: () => api("/contests/mine"),
    refetchInterval: 15_000,
  });
  const supportSettings = useQuery({
    queryKey: ["settings", "public"],
    queryFn: () => api("/settings/public"),
    staleTime: 5 * 60_000,
  });
  const supportNumber = supportSettings.data?.supportWhatsapp?.replace(/\D/g, "");
  const supportMessage = encodeURIComponent("Hello Proboss Ludo support, I need help with my account.");
  const supportWhatsappUrl = supportNumber
    ? `https://wa.me/${supportNumber}?text=${supportMessage}`
    : `https://wa.me/?text=${supportMessage}`;

  useEffect(() => {
    if (!socket.connected) socket.connect();
    function resubscribe() {
      socket.emit("subscribe:contests", {}, () => {});
    }
    socket.on("connect", resubscribe);
    socket.on("contest:list-changed", () => {
      qc.invalidateQueries({ queryKey: ["contests"] });
    });
    socket.on("wallet:updated", (view) => qc.setQueryData(["wallet"], view));
    resubscribe();
    return () => {
      socket.off("connect");
      socket.off("contest:list-changed");
      socket.off("wallet:updated");
    };
  }, [qc]);

  const openBattles = open.data?.items || [];
  const myBattles = mine.data?.items || [];

  const mySearchingBattles = useMemo(
    () => myBattles.filter((c) => c.status === "open" && creatorOf(c)?.isYou),
    [myBattles]
  );

  const hasMyReport = (c) => {
    const me = (c.players || []).find((p) => p.isYou);
    return (c.resultReports || []).some((r) => String(r.userId) === String(me?.userId));
  };

  // Guard: checks if user is already in an active/running match
  const myActiveBattle = useMemo(
    () =>
      myBattles.find((c) => {
        if (!ACTIVE_STATUSES.includes(c.status)) return false;
        if (c.status === "result_submitted" || c.status === "cancel_requested") {
          return !hasMyReport(c);
        }
        return true;
      }),
    [myBattles]
  );

  const visibleOpenBattles = useMemo(() => {
    const list = openBattles.filter((c) => c.status === "open");
    for (const c of myBattles) {
      if (c.status === "join_requested" && isMine(c)) list.push(c);
    }
    return [...new Map(list.map((c) => [c.id, c])).values()].sort(
      (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );
  }, [openBattles, myBattles]);

  const runningBattles = useMemo(() => {
    const real = myBattles.filter((c) => RUNNING_STATUSES.includes(c.status));
    real.sort((a, b) => {
      const aMine = isMine(a) ? 0 : 1;
      const bMine = isMine(b) ? 0 : 1;
      if (aMine !== bMine) return aMine - bMine;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
    return real;
  }, [myBattles]);
  const demoBattles = useMemo(() => createDemoBattles(demoHour), [demoHour]);
  const previewPaise = useMemo(() => {
    const amt = Number(betAmount);
    if (!Number.isFinite(amt) || amt < MIN_AMOUNT || amt > MAX_AMOUNT || amt % AMOUNT_STEP !== 0) return null;
    return { stake: rupeesToPaise(amt), ...computePrize(rupeesToPaise(amt)) };
  }, [betAmount]);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["contests"] });
    qc.invalidateQueries({ queryKey: ["wallet"] });
    qc.invalidateQueries({ queryKey: ["profile"] });
  }

  function validateAmount() {
    const amt = Number(betAmount);
    if (!amt || amt < MIN_AMOUNT || amt > MAX_AMOUNT || amt % AMOUNT_STEP !== 0) {
      setCreateError(`Enter an amount between ₹${MIN_AMOUNT} and ₹${MAX_AMOUNT.toLocaleString("en-IN")} in multiples of ₹${AMOUNT_STEP}.`);
      return false;
    }
    return true;
  }

  async function handleCreate() {
    setCreateError("");
    if (myActiveBattle) {
      setCreateError("You are already in a match.");
      return;
    }
    if (!validateAmount()) return;

    if (mySearchingBattles.length >= MAX_SEARCHING_BATTLES) {
      setCreateError("You can keep only 2 open battles. Cancel one first.");
      return;
    }

    const amt = Number(betAmount);
    const stake = rupeesToPaise(amt);
    if (mySearchingBattles.some((c) => c.stake === stake)) {
      toast.error(`You already have an open battle of ₹${amt}`);
      return;
    }

    try {
      setActionLoading(true);
      await api("/contests", { method: "POST", body: { stake } });
      setBetAmount("");
      invalidate();
    } catch (err) {
      const msg = String(err?.message || "");
      if (/already|game|match/i.test(msg)) {
        setCreateError("You are already in a match.");
      } else if (/insufficient|balance|fund/i.test(msg)) {
        setCreateError(`Insufficient available wallet balance for ₹${amt}. Add funds or choose a lower amount.`);
      } else {
        setCreateError(msg || "Could not create battle.");
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function joinMatch(battleId) {
    if (myActiveBattle) {
      toast.error("You are already in a match");
      return;
    }
    try {
      setActionLoading(true);
      await api(`/contests/${battleId}/join`, { method: "POST" });
      invalidate();
    } catch (err) {
      const msg = String(err?.message || "");
      if (/already|game|match/i.test(msg)) {
        toast.error("You are already in a match");
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function cancelBattle(battleId) {
    try {
      setActionLoading(true);
      await api(`/contests/${battleId}/cancel`, { method: "POST" });
      toast.error("Battle cancelled");
      invalidate();
    } catch (err) {
      // Handle silently or minimal error
    } finally {
      setActionLoading(false);
    }
  }

  async function startBattle(battleId) {
    try {
      setActionLoading(true);
      await api(`/contests/${battleId}/start`, { method: "POST" });
      invalidate();
      navigate(`/battle/${battleId}`);
    } catch (err) {
      invalidate();
    } finally {
      setActionLoading(false);
    }
  }

  async function rejectRequest(battleId) {
    try {
      setActionLoading(true);
      await api(`/contests/${battleId}/reject`, { method: "POST" });
      invalidate();
    } catch (err) {
      // Handle silently
    } finally {
      setActionLoading(false);
    }
  }

  function getOpenAction(c) {
    if (c.status === "join_requested") {
      if (creatorOf(c)?.isYou) {
        return (
          <div className="flex flex-col gap-1">
            <Button variant="success" className="px-2.5 py-1 text-[10px]" disabled={actionLoading} onClick={() => startBattle(c.id)}>
              START
            </Button>
            <Button variant="danger" className="px-2.5 py-1 text-[10px]" disabled={actionLoading} onClick={() => rejectRequest(c.id)}>
              REJECT
            </Button>
          </div>
        );
      }
      if (opponentOf(c)?.isYou) {
        return <LoadingIndicator label="WAITING" />;
      }
    }

    if (c.status === "open" && creatorOf(c)?.isYou) {
      return <LoadingIndicator />;
    }

    if (c.status === "open") {
      return (
        <Button
          variant="success"
          className="px-3 py-1.5 text-[11px]"
          disabled={actionLoading}
          onClick={() => joinMatch(c.id)}
        >
          PLAY
        </Button>
      );
    }

    return <LoadingIndicator label="WAITING" />;
  }

  const loading = open.isLoading || mine.isLoading;

  return (
    <div className="flex flex-col gap-4">
      {demoNotice && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm font-semibold text-amber-950 shadow-xl"
        >
          {demoNotice}
        </div>
      )}
      <section
        className="mt-2 rounded-xl border border-[#f41468] bg-gradient-to-r from-[#25103b] via-[#1a082a] to-[#321043] p-3.5 shadow-[0_0_18px_rgba(244,20,104,.14)]"
        data-purpose="promo-banner"
      >
        <div className="space-y-1.5 text-center text-[12px] font-bold leading-relaxed tracking-tight text-white sm:text-[13px]">
          <p>
           Proboss Ludo वेबसाइट पर आपका हार्दिक स्वागत है, दोस्तों, Withdrawal में कोई प्रोब्लम नहीं है (Super Fast Withdrawal ⏩)।
          </p>
          {supportNumber ? (
            <a
              href={supportWhatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block font-extrabold text-[#55baff] underline decoration-[#f41468] underline-offset-2"
            >
              🙏 Support no ☎️ +{supportNumber}
            </a>
          ) : (
            <p className="font-extrabold text-[#55baff]">🙏 Support no ☎️</p>
          )}
        </div>
      </section>

      <div className="flex justify-center">
        <h2 className="flex items-center gap-2 text-base font-black tracking-tight text-ink">
          <span aria-hidden="true">⚔️</span>
          Create Battle
          <span aria-hidden="true">⚔️</span>
        </h2>
      </div>

      <div className="rounded-3xl border border-gray-100 bg-white p-2 shadow-card">
        <div className="flex items-center gap-2 rounded-full bg-white p-2 ring-1 ring-gray-200">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-base font-black text-slate-700">
            ₹
          </div>

          <input
            type="number"
            inputMode="numeric"
            placeholder="Enter Amount"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm font-semibold text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400"
            value={betAmount}
            min={MIN_AMOUNT}
            max={MAX_AMOUNT}
            step={AMOUNT_STEP}
            onChange={(e) => {
              setBetAmount(e.target.value);
              setCreateError("");
            }}
          />

          <button
            type="button"
            disabled={actionLoading}
            onClick={handleCreate}
            className="mr-1 shrink-0 rounded-full bg-[#55baff] px-4 py-2 text-xs font-extrabold text-[#1a082a] transition-all hover:bg-[#36a9f7] active:scale-95 disabled:opacity-60"
          >
            {actionLoading ? "…" : "Set"}
          </button>
        </div>

        {createError && <p role="alert" className="px-3 pt-2 text-xs font-bold text-rose-600">{createError}</p>}

        <p className="px-3 pb-1 pt-2 text-[11px] font-semibold text-slate-500">
          Min ₹{MIN_AMOUNT} · Max ₹{MAX_AMOUNT.toLocaleString("en-IN")} · multiples of ₹{AMOUNT_STEP}
          {previewPaise && (
            <>
              {" · "}
              <span className="font-bold text-brand-600">winner gets {formatPaise(previewPaise.prizePaise)}</span>
            </>
          )}
        </p>
      </div>

      <div>
        <SectionTitle title="Open Battles" action={<span className="text-[11px] font-bold text-slate-400">⚔️ live</span>} />
        <div className="mt-2 flex flex-col gap-3">
          {loading && <Skeleton className="h-24 w-full" />}
          {!loading && visibleOpenBattles.length === 0 && <Empty title="No Battles Live" hint="Create one above to get started." />}

          {visibleOpenBattles.map((c) => (
            <OpenCard
              key={c.id}
              battle={c}
              action={getOpenAction(c)}
              onCancel={
                (c.status === "open" && creatorOf(c)?.isYou) ||
                (c.status === "join_requested" && opponentOf(c)?.isYou)
                  ? () => cancelBattle(c.id)
                  : null
              }
              cancelDisabled={actionLoading}
            />
          ))}
        </div>
      </div>

      <div className="h-[3px] rounded-full bg-gray-200" />

      <div>
        <SectionTitle title="Running Battles" action={<span className="text-[11px] font-bold text-slate-400">⚔️ live</span>} />
        <div className="mt-2 flex flex-col gap-3">
          {!loading && runningBattles.length === 0 && <Empty title="No Running Battles" />}

          {runningBattles.map((c) => (
            <MatchCard
              key={c.id}
              battle={c}
              onClick={() => navigate(`/battle/${c.id}`)}
            />
          ))}

          <section aria-label="Fictional demo battles" className="mt-2 space-y-2">
            <div role="note" className="rounded-xl border border-amber-400 bg-amber-50 px-3 py-2 text-center">
              <p className="text-xs font-black uppercase tracking-wide text-amber-950">Demo examples — not live battles</p>
              <p className="mt-0.5 text-[10px] font-semibold text-amber-900">
                Fictional players and stakes; these cards cannot be joined. Examples refresh hourly.
              </p>
            </div>
            {demoBattles.map((battle) => (
              <DemoMatchCard
                key={battle.id}
                battle={battle}
                onClick={() => setDemoNotice("This is a fictional demo battle. Only real battles can be opened or joined.")}
              />
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}

function OpenCard({ battle, action, onCancel, cancelDisabled }) {
  const creator = creatorOf(battle);
  return (
    <article className="overflow-hidden rounded-2xl border border-[#f41468]/70 bg-[#1a082a] shadow-[0_0_14px_rgba(244,20,104,.12)]">
      <div className="relative flex min-h-10 items-center gap-2 border-b border-[#f41468]/30 bg-[#321043] px-3 py-2">
        <h3 className="text-[11px] font-semibold text-white/75">Challenge From</h3>
        <h3 className={`truncate text-[12px] font-black text-white ${onCancel ? "pr-10" : ""}`}>{creator?.name || "Player"}</h3>
        {onCancel && (
          <button
            type="button"
            aria-label={battle.status === "join_requested" ? "Withdraw join request" : "Cancel open battle"}
            title={battle.status === "join_requested" ? "Withdraw join request" : "Cancel open battle"}
            disabled={cancelDisabled}
            onClick={onCancel}
            className="absolute right-2 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#f41468] shadow-md ring-1 ring-[#f41468]/40 transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 items-center gap-2 px-3 py-3">
        <MoneyBlock label="Entry Fee" value={battle.stake} />
        <div className="flex shrink-0 justify-center">{action}</div>
        <MoneyBlock label="Winning" value={battle.prize ?? computePrize(battle.stake).prizePaise} right />
      </div>
    </article>
  );
}

function MatchCard({ battle, onClick }) {
  if (!battle) return null;

  const status = String(battle.status || "").toLowerCase();
  const isPending = status === "result_submitted" || status === "cancel_requested";
  const mine = isMine(battle);

  const creatorName = creatorOf(battle)?.name || "Player";
  const opponentName = opponentOf(battle)?.name || "Opponent";
  const prize = battle.prize ?? computePrize(battle.stake).prizePaise;

  return (
    <article
      onClick={onClick}
      className={`cursor-pointer overflow-hidden rounded-2xl border bg-[#1a082a] shadow-[0_0_14px_rgba(244,20,104,.12)] transition active:scale-[0.99] ${
        isPending ? "border-orange-300/70" : "border-[#f41468]/60"
      }`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-[#f41468]/30 bg-[#321043] px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-white/75">Playing For</span>
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-300 via-brand-500 to-[#C98509] text-[10px] font-black text-white shadow-sm">
            ₹
          </span>
          <span className="truncate text-xs font-black text-white">{formatPaise(battle.stake, { withSymbol: false })}</span>
        </div>

        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-white/75">Prize</span>
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-300 via-brand-500 to-[#C98509] text-[10px] font-black text-white shadow-sm">
            ₹
          </span>
          <span className="truncate text-xs font-black text-white">{formatPaise(prize, { withSymbol: false })}</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 bg-[#1a082a] px-8 py-2.5">
        <PlayerAvatar name={creatorName} />

        <div className="flex shrink-0 items-center justify-center">
          {mine ? (
            isPending ? (
              <span className="rounded-full bg-orange-500 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow-md shadow-orange-500/20">
                Pending
              </span>
            ) : (
              <span className="rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow-md shadow-indigo-500/25">
                VIEW
              </span>
            )
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink shadow-inner ring-2 ring-white/60">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4 text-white"
              >
                <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" />
                <line x1="13" x2="19" y1="19" y2="13" />
                <line x1="16" x2="20" y1="16" y2="20" />
                <line x1="19" x2="21" y1="21" y2="19" />
                <polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5" />
                <line x1="5" x2="9" y1="14" y2="18" />
                <line x1="7" x2="4" y1="17" y2="20" />
                <line x1="3" x2="5" y1="19" y2="21" />
              </svg>
            </div>
          )}
        </div>

        <PlayerAvatar name={opponentName} />
      </div>
    </article>
  );
}

function DemoMatchCard({ battle, onClick }) {
  return (
    <article
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick?.();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="Fictional demo battle, not a live match"
      className="cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed border-amber-400 bg-[#1a082a] shadow-[0_0_12px_rgba(244,20,104,.08)]"
    >
      <div className="flex items-center justify-between gap-2 border-b border-amber-400/50 bg-[#321043] px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-white/75">Playing For</span>
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-300 via-brand-500 to-[#C98509] text-[10px] font-black text-white shadow-sm">₹</span>
          <span className="truncate text-xs font-black text-white">{formatPaise(battle.stake, { withSymbol: false })}</span>
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-white/75">Prize</span>
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-300 via-brand-500 to-[#C98509] text-[10px] font-black text-white shadow-sm">₹</span>
          <span className="truncate text-xs font-black text-white">{formatPaise(battle.prize, { withSymbol: false })}</span>
        </div>
        <span className="shrink-0 rounded-full bg-amber-300 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-amber-950">Demo</span>
      </div>
      <div className="flex items-center justify-between gap-2 bg-[#1a082a] px-8 py-2.5">
        <PlayerAvatar name={battle.players[0]} />
        <div aria-hidden="true" className="flex shrink-0 items-center justify-center">
          <img src="/battle-vs.png" alt="" className="h-14 w-14 object-contain drop-shadow-[0_0_8px_rgba(244,20,104,.2)]" />
        </div>
        <PlayerAvatar name={battle.players[1]} />
      </div>
    </article>
  );
}

function PlayerAvatar({ name }) {
  const safeName = String(name || "Player").trim() || "Player";

  return (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-indigo-50 shadow ring-2 ring-white">
        <img
          src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(safeName)}`}
          alt={safeName}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      </div>
      <p className="w-full truncate text-center text-[10px] font-bold text-white">{safeName}</p>
    </div>
  );
}

function MoneyBlock({ label, value, right = false }) {
  return (
    <div className={right ? "text-right" : "text-left"}>
      <p className="text-[11px] font-medium text-white/75">{label}</p>
      <p className="mt-0.5 text-sm font-black text-white">{formatPaise(value || 0)}</p>
    </div>
  );
}

function LoadingIndicator({ label }) {
  return (
    <div role="status" aria-label={label || "Waiting for an opponent"} className={`flex items-center justify-center ${label ? "gap-1.5" : ""}`}>
      <img src="/loading-spinner.png" alt="" aria-hidden="true" className="h-10 w-10 animate-spin object-contain" />
      {label && <p className="text-[10px] font-bold text-white/80">{label}</p>}
    </div>
  );
}

function createDemoBattles(hourSeed) {
  let state = hourSeed >>> 0;
  const random = () => {
    state = (state + 0x6D2B79F5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };

  const names = new Set();
  while (names.size < 30) {
    let name = "";
    for (let index = 0; index < 5; index += 1) {
      name += DEMO_NAME_ALPHABET[Math.floor(random() * DEMO_NAME_ALPHABET.length)];
    }
    names.add(name);
  }
  const players = [...names];

  return Array.from({ length: 15 }, (_, index) => {
    const stake = rupeesToPaise(DEMO_STAKES_RUPEES[Math.floor(random() * DEMO_STAKES_RUPEES.length)]);
    return {
      id: `demo-${hourSeed}-${index}`,
      stake,
      prize: computePrize(stake).prizePaise,
      players: [players[index * 2], players[index * 2 + 1]],
    };
  });
}
