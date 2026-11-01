import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { socket } from "../lib/socket.js";
import { computePrize, formatPaise, rupeesToPaise } from "../lib/money.js";
import { useToast } from "../components/Toast.jsx";
import { Button, Empty, Skeleton } from "../components/ui.jsx";

const MAX_SEARCHING_BATTLES = 2;
const MIN_AMOUNT = 50;
const MAX_AMOUNT = 100000;
const AMOUNT_STEP = 50;

const ACTIVE_STATUSES = ["join_requested", "running", "room_submitted", "result_submitted", "cancel_requested"];
const RUNNING_STATUSES = ["running", "room_submitted", "result_submitted", "cancel_requested"];
const DEMO_NAME_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DEMO_STAKES_PAISE = [
  5000, 10000, 15000, 20000, 25000, 30000, 40000, 50000, 75000, 100000,
  150000, 200000, 250000, 300000, 400000, 500000, 750000, 1000000, 1500000, 2000000,
];

const creatorOf = (c) => c?.players?.find((p) => p.seat === 1) || null;
const opponentOf = (c) => c?.players?.find((p) => p.seat === 2) || null;
const isMine = (c) => Boolean(c?.players?.some((p) => p.isYou));

export default function Play() {
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [betAmount, setBetAmount] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [busyBattleAction, setBusyBattleAction] = useState(null);
  const [createError, setCreateError] = useState("");
  const [demoHour, setDemoHour] = useState(() => Math.floor(Date.now() / 3_600_000));

  useEffect(() => {
    const interval = window.setInterval(() => {
      setDemoHour(Math.floor(Date.now() / 3_600_000));
    }, 60_000);
    return () => window.clearInterval(interval);
  }, []);

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
  // every live battle on the platform (not just the viewer's) — /contests/running
  const running = useQuery({
    queryKey: ["contests", "running"],
    queryFn: () => api("/contests/running"),
    refetchInterval: 15_000,
  });
  const wallet = useQuery({
    queryKey: ["wallet"],
    queryFn: () => api("/wallet"),
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
    function refreshLists() {
      qc.invalidateQueries({ queryKey: ["contests"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    }
    socket.on("connect", resubscribe);
    socket.on("contest:list-changed", refreshLists);
    socket.on("contest:updated", refreshLists);
    socket.on("wallet:updated", (view) => qc.setQueryData(["wallet"], view));
    function onFocus() {
      refreshLists();
    }
    window.addEventListener("focus", onFocus);
    resubscribe();
    return () => {
      socket.off("connect");
      socket.off("contest:list-changed");
      socket.off("contest:updated");
      socket.off("wallet:updated");
      window.removeEventListener("focus", onFocus);
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

  const demoBattles = useMemo(() => createDemoBattles(demoHour), [demoHour]);

  const runningBattles = useMemo(() => {
    // real battles: everyone's live battles from the global /contests/running
    const real = (running.data?.items || []).filter((c) => RUNNING_STATUSES.includes(c.status));
    real.sort((a, b) => {
      const aMine = isMine(a) ? 0 : 1;
      const bMine = isMine(b) ? 0 : 1;
      if (aMine !== bMine) return aMine - bMine;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
    // wait for the first real load so the fake list doesn't fight the skeletons
    if (running.data === undefined) return real;
    // demo battles fill the rest of the list (after any real ones)
    return [...real, ...demoBattles];
  }, [running.data, demoBattles]);

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

    const availablePaise = Number(wallet.data?.availablePaise) || 0;
    if (stake > availablePaise) {
      const msg = `Insufficient balance: ₹${amt} entry fee is more than your ₹${formatPaise(availablePaise, { withSymbol: false })} balance.`;
      toast.error(msg);
      setCreateError(msg);
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

  async function joinMatch(battle) {
    if (myActiveBattle) {
      toast.error("You are already in a match");
      return;
    }

    const availablePaise = Number(wallet.data?.availablePaise) || 0;
    const stakePaise = Number(battle?.stake) || 0;
    if (stakePaise > availablePaise) {
      const entry = formatPaise(stakePaise, { withSymbol: false });
      toast.error(`Insufficient balance: the ${entry} entry fee is more than your ₹${formatPaise(availablePaise, { withSymbol: false })} balance.`);
      return;
    }

    try {
      setActionLoading(true);
      setBusyBattleAction({ id: battle.id, action: "join" });
      await api(`/contests/${battle.id}/join`, { method: "POST" });
      invalidate();
    } catch (err) {
      const msg = String(err?.message || "");
      if (/already|game|match/i.test(msg)) {
        toast.error("You are already in a match");
      } else if (/insufficient|balance|fund/i.test(msg)) {
        toast.error("Insufficient balance for this battle");
      } else if (/no longer available|not available/i.test(msg)) {
        // a dummy/social-proof battle was clicked — it disappears for good; refresh right away
        qc.invalidateQueries({ queryKey: ["contests"] });
        toast.info("This battle is no longer available");
      } else if (msg) {
        toast.error(msg);
      }
    } finally {
      setActionLoading(false);
      setBusyBattleAction(null);
    }
  }

  async function cancelBattle(battleId) {
    try {
      setActionLoading(true);
      setBusyBattleAction({ id: battleId, action: "cancel" });
      await api(`/contests/${battleId}/cancel`, { method: "POST" });
      toast.error("Battle cancelled");
      invalidate();
    } catch (err) {
      // Handle silently
    } finally {
      setActionLoading(false);
      setBusyBattleAction(null);
    }
  }

  async function startBattle(battleId) {
    try {
      setActionLoading(true);
      setBusyBattleAction({ id: battleId, action: "start" });
      await api(`/contests/${battleId}/start`, { method: "POST" });
      invalidate();
      navigate(`/battle/${battleId}`);
    } catch (err) {
      invalidate();
    } finally {
      setActionLoading(false);
      setBusyBattleAction(null);
    }
  }

  async function rejectRequest(battleId) {
    try {
      setActionLoading(true);
      setBusyBattleAction({ id: battleId, action: "reject" });
      await api(`/contests/${battleId}/reject`, { method: "POST" });
      invalidate();
    } catch (err) {
      // Handle silently
    } finally {
      setActionLoading(false);
      setBusyBattleAction(null);
    }
  }

  function getOpenAction(c) {
    const isBusy = busyBattleAction?.id === c.id;
    if (c.status === "join_requested") {
      if (creatorOf(c)?.isYou) {
        if (isBusy) return <BattleActionSpinner label="Starting battle" />;
        return (
          <div className="flex items-center justify-center gap-1.5">
            <Button variant="success" className="!rounded-lg !px-2.5 !py-1.5 !text-[10px]" disabled={actionLoading} onClick={() => startBattle(c.id)}>
              Start
            </Button>
            <Button variant="danger" className="!rounded-lg !px-2.5 !py-1.5 !text-[10px]" disabled={actionLoading} onClick={() => rejectRequest(c.id)}>
              Reject
            </Button>
          </div>
        );
      }
      if (opponentOf(c)?.isYou) {
        return <BattleActionSpinner label="WAIT" />;
      }
    }

    if (c.status === "open" && creatorOf(c)?.isYou) {
      return <BattleActionSpinner />;
    }

    if (c.status === "open") {
      if (isBusy) return <BattleActionSpinner label="Joining battle" />;
      return (
        <Button
          variant="success"
          aria-label={`Play battle for ${formatPaise(c.stake)}`}
          className="!h-16 !w-16 !border-[3px] !border-[#147bff] !bg-[#020817] !p-0 animate-pulse text-[11px] font-black text-white shadow-[0_0_0_3px_rgba(20,123,255,.18),0_0_18px_rgba(20,123,255,.45)] hover:!bg-[#071a36] motion-reduce:animate-none"
          disabled={actionLoading}
          onClick={() => joinMatch(c)}
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
      <section
        className="mt-2 rounded-xl border border-[#f41468] bg-gradient-to-r from-[#25103b] via-[#1a082a] to-[#321043] p-3.5 shadow-[0_0_18px_rgba(244,20,104,.14)]"
        data-purpose="promo-banner"
      >
        <div className="space-y-1.5 text-center text-[12px] font-bold leading-relaxed tracking-tight text-white sm:text-[13px]">
          {supportSettings.isLoading ? (
            <Skeleton className="mx-auto h-4 w-4/5 bg-white/20" />
          ) : supportSettings.isError ? (
            <p role="status">Notice is temporarily unavailable.</p>
          ) : supportSettings.data?.battleNotice ? (
            <p>{supportSettings.data.battleNotice}</p>
          ) : (
            <p>Proboss Ludo वेबसाइट पर आपका हार्दिक स्वागत है, दोस्तों, Withdrawal में कोई प्रोब्लम नहीं है (Super Fast Withdrawal ⏭️) !</p>
          )}
          {supportSettings.isLoading ? (
            <Skeleton className="mx-auto h-4 w-36 bg-white/20" />
          ) : supportSettings.isError ? (
            <p role="status" className="font-extrabold text-[#55baff]">🙏 Support temporarily unavailable</p>
          ) : supportNumber ? (
            <a
              href={supportWhatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block font-extrabold text-[#55baff] underline decoration-[#f41468] underline-offset-2"
            >
              🙏 Support no ☎️ +{supportNumber}
            </a>
          ) : (
            <p className="font-extrabold text-[#55baff]">🙏 Support no ☎️ +8764892841</p>
          )}
        </div>
      </section>

      <div>
        <h2 className="text-center text-lg font-black tracking-wider uppercase text-transparent bg-clip-text bg-gradient-to-r from-[#55baff] to-[#f41468] drop-shadow-[0_0_12px_rgba(85,186,255,0.4)] mb-2 flex items-center justify-center gap-2">
          <span>⚔️</span> Create Battle <span>⚔️</span>
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

        <div className="flex items-center justify-end px-3 pb-1 pt-2">
          <span className="text-[11px] font-semibold text-slate-500">Min ₹50- Max ₹ 1 Lakh</span>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-black tracking-wider uppercase text-transparent bg-clip-text bg-gradient-to-r from-[#55baff] to-[#f41468] drop-shadow-[0_0_12px_rgba(244,20,104,0.4)]">
            Open Battles
          </h2>
          <span className="text-xs font-bold text-white flex items-center gap-1">⚔️ live</span>
        </div>
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
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-black tracking-wider uppercase text-transparent bg-clip-text bg-gradient-to-r from-[#55baff] to-[#f41468] drop-shadow-[0_0_12px_rgba(85,186,255,0.4)]">
            Running Battles
          </h2>
          <span className="text-xs font-bold text-white flex items-center gap-1">⚔️ live</span>
        </div>
        <div className="mt-2 flex flex-col gap-3">
          {!loading && runningBattles.length === 0 && demoBattles.length === 0 && <Empty title="No Running Battles" />}

          {runningBattles.map((c) => (
            <MatchCard
              key={c.id}
              battle={c}
              onClick={() => {
                // everyone can SEE all running battles, but only a participant can open one
                if (!isMine(c)) return;
                navigate(`/battle/${c.id}`);
              }}
            />
          ))}

          {demoBattles.map((battle) => (
            <DemoMatchCard key={battle.id} battle={battle} />
          ))}
        </div>
      </div>
    </div>
  );
}

function OpenCard({ battle, action, onCancel, cancelDisabled }) {
  const creator = creatorOf(battle);
  const hasMiddleActions = battle.status === "join_requested" && creator?.isYou;
  const prize = battle.prize ?? computePrize(battle.stake).prizePaise;
  return (
    <article className={`relative grid min-h-24 grid-cols-[2.5rem_minmax(0,1fr)_4rem] ${hasMiddleActions ? "grid-rows-[auto_auto_auto]" : "grid-rows-[auto_auto]"} items-center gap-x-1.5 gap-y-1.5 overflow-hidden rounded-[1.15rem] border border-[#145bb5] bg-[radial-gradient(ellipse_at_95%_100%,rgba(0,105,255,.38),transparent_42%),linear-gradient(110deg,#020617_0%,#030712_70%,#071a36_100%)] p-2 shadow-[0_0_14px_rgba(20,93,190,.18)]`}>
      <div className={`col-start-1 row-start-1 ${hasMiddleActions ? "row-span-3" : "row-span-2"} flex items-center justify-center`}>
        <svg aria-hidden="true" viewBox="0 0 48 56" className="h-10 w-9 drop-shadow-[0_0_8px_rgba(245,158,11,.4)]">
          <path d="M12 5h24v7c0 12-4 19-12 22-8-3-12-10-12-22V5Z" fill="#b7790b" stroke="#fbbf24" strokeWidth="2" />
          <path d="M12 10H4v5c0 8 4 12 12 13M36 10h8v5c0 8-4 12-12 13" fill="none" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
          <path d="M24 34v9m-9 5h18m-15-5h12" fill="none" stroke="#fbbf24" strokeWidth="4" strokeLinecap="round" />
          <path d="m24 12 1.8 4 4.4.4-3.3 2.8 1 4.2-3.9-2.2-3.9 2.2 1-4.2-3.3-2.8 4.4-.4L24 12Z" fill="#fff1a8" />
        </svg>
      </div>
      <div className="col-start-2 row-start-1 flex min-w-0 items-center gap-2 pr-5">
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-blue-500/80 bg-blue-950/70 px-2 py-1 text-[10px] font-bold text-white">
          <span className="h-2 w-2 rounded-full bg-sky-300 shadow-[0_0_8px_rgba(125,211,252,.9)]" />
          {battle.status === "join_requested" ? "Request" : "Live"}
        </span>
        <h3 className="truncate text-[13px] font-black text-white">{creator?.name || "Player"}</h3>
      </div>
      <div className={`col-start-2 row-start-2 flex min-w-0 items-center ${hasMiddleActions ? "justify-between gap-4" : "gap-2"}`}>
        <MoneyBlock label="Entry Fee" value={battle.stake} compact={hasMiddleActions} />
        {!hasMiddleActions && <div className="h-9 w-px shrink-0 bg-blue-300/50" />}
        <MoneyBlock label="Winning Prize" value={prize} compact={hasMiddleActions} />
      </div>
      {hasMiddleActions && <div className="col-start-2 row-start-3 flex justify-center">{action}</div>}
      <div className={`col-start-3 row-start-1 ${hasMiddleActions ? "row-span-3" : "row-span-2"} flex translate-y-3 items-center justify-center`}>
        {!hasMiddleActions && action}
      </div>
      {onCancel && (
        <button
          type="button"
          aria-label={battle.status === "join_requested" ? "Withdraw join request" : "Cancel open battle"}
          title={battle.status === "join_requested" ? "Withdraw join request" : "Cancel open battle"}
          disabled={cancelDisabled}
          onClick={onCancel}
          className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-blue-400/70 bg-[#061329] text-white shadow-[0_0_8px_rgba(20,123,255,.45)] transition hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      )}
    </article>
  );
}

function MatchCard({ battle, onClick }) {
  if (!battle) return null;

  const status = String(battle.status || "").toLowerCase();
  const isPending = status === "result_submitted" || status === "cancel_requested";
  const mine = isMine(battle);

  return (
    <RunningBattleCard
      battle={battle}
      playerNames={[creatorOf(battle)?.name || "Player", opponentOf(battle)?.name || "Opponent"]}
      onClick={onClick}
      statusLabel={mine ? (isPending ? "Pending" : "View") : null}
      pending={isPending}
    />
  );
}

function DemoMatchCard({ battle }) {
  return (
    <RunningBattleCard battle={battle} playerNames={battle.players} />
  );
}

function RunningBattleCard({ battle, playerNames, onClick, statusLabel, pending = false }) {
  const [creatorName, opponentName] = playerNames;
  const prize = battle.prize ?? computePrize(battle.stake).prizePaise;
  return (
    <article
      onClick={onClick}
      className={`min-h-[5.75rem] overflow-hidden rounded-[1.15rem] border bg-[linear-gradient(145deg,#140a35_0%,#0d0927_55%,#130a35_100%)] p-2 shadow-[0_0_14px_rgba(91,33,182,.18)] ${
        onClick ? "cursor-pointer transition active:scale-[0.99]" : ""
      } ${pending ? "border-orange-300/70" : "border-violet-500/50"}`}
    >
      <div className="flex min-h-[2rem] min-w-0 items-center justify-between gap-2.5 border-b border-white/10 px-2 pb-2">
        <span className="shrink-0 text-xs font-bold text-white sm:text-sm">Playing For</span>
        
        <div className="flex min-w-0 items-center justify-center gap-1.5 rounded-full border border-violet-400/30 bg-gradient-to-b from-[#291566] to-[#170b43] px-3 py-1 shadow-[inset_0_1px_6px_rgba(167,139,250,.15)] mx-auto">
          <span className="max-w-[25vw] truncate text-xs font-black text-white sm:max-w-32">{creatorName}</span>
          <span aria-hidden="true" className="shrink-0 text-xs font-black text-pink-400">&amp;</span>
          <span className="max-w-[25vw] truncate text-xs font-black text-white sm:max-w-32">{opponentName}</span>
        </div>

        <div className="flex shrink-0 items-center gap-1 rounded-full bg-rose-600/80 px-2 py-0.5 shadow-[0_0_8px_rgba(244,20,104,0.6)] animate-pulse">
          <span className="h-1.5 w-1.5 rounded-full bg-white"></span>
          <span className="text-[9px] font-black tracking-wider text-white">LIVE</span>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)] items-center gap-2 px-1 sm:px-2">
        <RunningBattlePrize label="ENTRY FEE" value={battle.stake} />
        <div className="flex flex-col items-center justify-center">
          <img
            src="/battle-vs.png"
            alt="versus"
            className="h-9 w-9 object-contain drop-shadow-[0_0_8px_rgba(244,20,104,.2)] sm:h-10 sm:w-10"
          />
          {statusLabel && (
            <span className={`mt-0.5 rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-white ${
              pending ? "bg-orange-500" : "bg-indigo-600"
            }`}>
              {statusLabel}
            </span>
          )}
        </div>
        <RunningBattlePrize label="WINNING PRIZE" value={prize} />
      </div>
    </article>
  );
}

function RunningBattlePrize({ label, value }) {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center rounded-[1rem] border border-violet-400/15 bg-gradient-to-b from-[#26145d] to-[#170d3e] px-2 py-1.5 shadow-[inset_0_1px_8px_rgba(167,139,250,.1)]">
      <span className="text-center text-[9px] font-semibold text-white/90 sm:text-[10px]">{label}</span>
      <span className="mt-0.5 flex items-center gap-0.5 text-sm font-black leading-none text-white sm:text-base">
        <span aria-hidden="true" className="text-base font-black text-sky-400 sm:text-lg">₹</span>
        <span className="truncate">{formatPaise(value || 0, { withSymbol: false })}</span>
      </span>
    </div>
  );
}

function MoneyBlock({ label, value, right = false, compact = false }) {
  return (
    <div className={`min-w-0 ${right ? "text-right" : "text-left"}`}>
      <p className={`font-medium text-white/75 ${compact ? "whitespace-nowrap text-[9px] leading-tight" : "text-[11px]"}`}>{label}</p>
      <p className={`mt-0.5 truncate font-black text-white ${compact ? "text-[11px]" : "text-sm"}`}>{formatPaise(value || 0)}</p>
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

function BattleActionSpinner({ label }) {
  return (
    <div role="status" aria-label={label || "Waiting for an opponent"} className="flex flex-col items-center justify-center gap-1">
      <img src="/loading-spinner.png" alt="" aria-hidden="true" className="h-12 w-12 animate-spin object-contain" />
      {label && <span className="text-[8px] font-bold uppercase tracking-wide text-white/75">{label}</span>}
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
  const stakes = [...DEMO_STAKES_PAISE];
  for (let index = stakes.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [stakes[index], stakes[swapIndex]] = [stakes[swapIndex], stakes[index]];
  }
  const minutesAgo = Array.from({ length: 15 }, (_, index) => 4 + (15 - index) * 31 + (index % 3) * 9);

  return Array.from({ length: 15 }, (_, index) => {
    const stake = stakes[index];
    return {
      id: `demo-${hourSeed}-${index}`,
      stake,
      prize: computePrize(stake).prizePaise,
      players: [players[index * 2], players[index * 2 + 1]],
      startedMinutesAgo: minutesAgo[index],
    };
  });
}
