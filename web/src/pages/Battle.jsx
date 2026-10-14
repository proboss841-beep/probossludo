import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiUpload } from "../lib/api.js";
import compressImage from "../lib/compressImage.js";
import { socket } from "../lib/socket.js";
import { useToast } from "../components/Toast.jsx";
import { Button, Empty, Input, Panel, Skeleton, StatusBadge } from "../components/ui.jsx";

/** Local Helper Function to format paise into Rupees (₹) */
function formatPaise(paise, opts = {}) {
  const rupees = (Number(paise) || 0) / 100;
  const formatted = rupees.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
  return opts.withSymbol === false ? formatted : `₹${formatted}`;
}

/** Active statuses that mean the user is currently playing/in a match */
const RUNNING_STATUSES = ["join_requested", "running", "room_submitted", "result_submitted", "cancel_requested"];

export default function Battle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();

  // State Management
  const [betAmount, setBetAmount] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [busy, setBusy] = useState(null); // "create" | "join" | "room" | "result" | "cancel" | "accept" | "reject"

  // Result Reporting + Screenshot Proof State
  const [outcome, setOutcome] = useState("");
  const [screenshot, setScreenshot] = useState(null);
  const [screenshotName, setScreenshotName] = useState("");

  /* -------------------------------------------------------------------------- */
  /*                            API QUERIES                                     */
  /* -------------------------------------------------------------------------- */

  // 1. Fetch Open Battles (Lobby View)
  const openContestsQuery = useQuery({
    queryKey: ["contests", "open"],
    queryFn: () => api("/contests/open").then((r) => r.items || []),
    enabled: !id,
    refetchInterval: 10_000,
  });

  // 2. Fetch User's Active / Running Battles (Lobby View)
  const runningContestsQuery = useQuery({
    queryKey: ["contests", "running"],
    queryFn: () =>
      api("/contests/mine").then((r) =>
        (r.items || []).filter((c) => RUNNING_STATUSES.includes(c.status))
      ),
    enabled: !id,
    refetchInterval: 10_000,
  });

  // 3. Fetch Single Contest Details (Room View)
  const contestQuery = useQuery({
    queryKey: ["contest", id],
    queryFn: () => api(`/contests/${id}`).then((r) => r.contest),
    enabled: Boolean(id),
    refetchInterval: 15_000,
  });

  /* -------------------------------------------------------------------------- */
  /*                         WEBSOCKET LISTENERS                                */
  /* -------------------------------------------------------------------------- */
  useEffect(() => {
    if (!socket.connected) socket.connect();

    function watch() {
      if (id) {
        socket.emit("watch:contest", { contestId: id }, () => {});
      } else {
        socket.emit("subscribe:contests", {}, () => {});
      }
    }

    const handleUpdate = (upd) => {
      if (id && String(upd?.id) === String(id)) {
        qc.invalidateQueries({ queryKey: ["contest", id] });
      }
      qc.invalidateQueries({ queryKey: ["contests"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    };

    socket.on("connect", watch);
    socket.on("contest:updated", handleUpdate);
    socket.on("contest:list-changed", handleUpdate);
    socket.on("contest:created", handleUpdate);

    watch();

    return () => {
      socket.off("connect", watch);
      socket.off("contest:updated", handleUpdate);
      socket.off("contest:list-changed", handleUpdate);
      socket.off("contest:created", handleUpdate);
    };
  }, [id, qc]);

  useEffect(() => {
    if (contestQuery.isError) {
      navigate("/");
    }
  }, [contestQuery.isError, navigate]);

  /* -------------------------------------------------------------------------- */
  /*                            ACTION HANDLERS                                 */
  /* -------------------------------------------------------------------------- */
  async function run(action, fn, okMessage) {
    setBusy(action);
    try {
      const res = await fn();
      if (okMessage) toast.success(okMessage);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["contest", id] }),
        qc.invalidateQueries({ queryKey: ["contests"] }),
        qc.invalidateQueries({ queryKey: ["wallet"] }),
      ]);
      return res;
    } catch (err) {
      // Suppress raw backend errors and show clean/restricted error messages
      if (err?.message?.includes("already") || err?.message?.includes("running")) {
        toast.error("You are already in a match");
      }
    } finally {
      setBusy(null);
    }
  }

  // Check if user currently has an active running match
  const hasActiveMatch = (runningContestsQuery.data || []).length > 0;

  // Create Battle Action (Amount MUST be multiple of 50, No wallet deduction here)
  const handleCreate = () => {
    if (hasActiveMatch) {
      return toast.error("You are already in a match");
    }

    const amt = Number(betAmount);
    if (!amt || amt % 50 !== 0) {
      return toast.error("Amount must be in multiples of 50");
    }

    return run(
      "create",
      async () => {
        const data = await api("/contests", {
          method: "POST",
          body: { stake: amt * 100 },
        });
        setBetAmount("");
        if (data?.contest?.id) {
          navigate(`/battle/${data.contest.id}`);
        }
      }
      // No extra notification on create
    );
  };

  // Join Battle Action (Opponent sends join request)
  const join = (targetId = id) => {
    if (hasActiveMatch) {
      return toast.error("You are already in a match");
    }

    return run(
      "join",
      async () => {
        await api(`/contests/${targetId}/join`, { method: "POST" });
        if (targetId !== id) navigate(`/battle/${targetId}`);
      }
      // No extra notification on join request
    );
  };

  // Accept Join Request Action (Creator accepts -> Status becomes running -> Wallet amounts deducted)
  const accept = (targetId = id) =>
    run(
      "accept",
      () => api(`/contests/${targetId}/accept`, { method: "POST" })
      // Starts match and deducts stakes from wallet
    );

  // Reject Join Request Action (Creator declines -> Request removed)
  const rejectJoin = (targetId = id) =>
    run(
      "reject",
      () => api(`/contests/${targetId}/reject`, { method: "POST" })
    );

  // Submit Room Code Action
  const submitRoom = () =>
    run(
      "room",
      () =>
        api(`/contests/${id}/room`, {
          method: "POST",
          body: { roomCode: roomCode.trim().toUpperCase() },
        })
    );

  // Submit Result Action
  const submitResultReport = () => {
    if (!outcome) return;

    return run(
      "result",
      async () => {
        let screenshotKeys = [];
        if (screenshot) {
          const compressed = await compressImage(screenshot);
          const { key } = await apiUpload("/uploads", compressed, "battle");
          screenshotKeys = [key];
        }
        await api(`/contests/${id}/result`, {
          method: "POST",
          body: { outcome, screenshotKeys },
        });
      }
    );
  };

  // Cancel Battle Action (Only allowed toast notification)
  const cancelBattle = (targetId = id) =>
    run(
      "cancel",
      () => api(`/contests/${targetId}/cancel`, { method: "POST" }),
      "Battle cancelled"
    );

  function pickScreenshot(file) {
    if (!file) return;
    setScreenshot(file);
    setScreenshotName(file.name);
  }

  /* -------------------------------------------------------------------------- */
  /*                   1. BATTLE ROOM VIEW (When Route has :id)                 */
  /* -------------------------------------------------------------------------- */
  if (id) {
    if (contestQuery.isLoading) {
      return (
        <div className="space-y-3 p-4 max-w-md mx-auto">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
        </div>
      );
    }

    const c = contestQuery.data;
    if (!c) return <Empty title="Battle not found" hint="It may have been settled or expired." />;

    const me = c.players?.find((p) => p.isYou);
    const inBattle = Boolean(me);
    const isCreator = Boolean(c.players?.find((p) => p.seat === 1)?.isYou);
    const winner = c.winnerUserId ? c.players?.find((p) => String(p.userId) === String(c.winnerUserId)) : null;
    const youWon = Boolean(winner && winner.isYou);
    const myReport = Boolean((c.resultReports || []).some((r) => String(r.userId) === String(me?.userId)));
    const resultOpen = ["running", "room_submitted", "result_submitted", "cancel_requested"].includes(c.status);

    return (
      <div className="max-w-md mx-auto p-4 space-y-4 text-slate-950">
        {/* Notice Banner */}
        <div className="overflow-hidden rounded-xl bg-black p-3.5 text-[11px] leading-relaxed text-white shadow-md">
          Proboss Ludo वेबसाइट पर आपका हार्दिक स्वागत है, दोस्तों, Withdrawal में कोई प्रोब्लम नहीं है (Super Fast Withdrawal ⏩)।
        </div>

        {/* Contest Header / Prize Card */}
        <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card">
          <div className="flex items-start justify-between gap-2 bg-slate-900 px-4 py-4 text-white">
            <PlayerHead player={c.players?.find((p) => p.seat === 1)} />
            <div className="flex flex-col items-center gap-1.5 pt-4">
              <span className="text-xs font-black tracking-[0.3em] text-white/40">VS</span>
              <StatusBadge status={c.status} />
            </div>
            <PlayerHead player={c.players?.find((p) => p.seat === 2)} />
          </div>
          <div className="flex items-center justify-between px-5 py-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Entry amount</p>
              <p className="text-base font-black text-slate-800">{formatPaise(c.stake)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Winning amount</p>
              <p className="text-base font-black text-emerald-600">{formatPaise(c.prize)}</p>
            </div>
          </div>
        </section>

        {/* Status Messages */}
        {c.status === "approved" && (
          <div className={`rounded-2xl border px-4 py-3.5 text-sm font-bold ${youWon ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-gray-50 text-slate-600"}`}>
            {youWon ? `🏆 You won ${formatPaise(c.prize)}!` : `Settled — ${winner?.name || "opponent"} won ${formatPaise(c.prize)}.`}
          </div>
        )}
        {c.status === "cancelled" && (
          <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm font-bold text-slate-600">
            Battle cancelled — amounts refunded.
          </div>
        )}

        {/* Open State (Searching Opponent - Wallet Not Deducted Yet) */}
        {c.status === "open" && (
          <Panel title={inBattle ? "Searching Opponent..." : "Open Battle"}>
            {inBattle ? (
              <div className="space-y-3">
                <p className="rounded-xl bg-indigo-50 px-3 py-2.5 text-xs font-bold text-indigo-700">
                  Waiting for an opponent to join. No amount is deducted from your wallet yet.
                </p>
                <Button variant="ghost" className="w-full text-rose-600 font-bold" onClick={() => cancelBattle(c.id)} loading={busy === "cancel"}>
                  Cancel Battle
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-500">
                  Send a join request to play this battle for {formatPaise(c.stake)}.
                </p>
                <Button className="w-full bg-emerald-600 text-white font-bold" onClick={() => join(c.id)} loading={busy === "join"}>
                  Join for {formatPaise(c.stake)}
                </Button>
              </div>
            )}
          </Panel>
        )}

        {/* Join Request Received (Creator decides to Start / Reject -> Deducts Amount on Start) */}
        {c.status === "join_requested" && (
          <Panel title={isCreator ? "Opponent Found!" : "Join Requested"}>
            {isCreator ? (
              <div className="space-y-3">
                <p className="rounded-xl bg-indigo-50 px-3 py-2.5 text-xs font-bold text-indigo-700">
                  Click 'Start' to accept and deduct {formatPaise(c.stake)} from both wallets to start the match.
                </p>
                <Button className="w-full bg-emerald-600 text-white font-bold" onClick={() => accept(c.id)} loading={busy === "accept"} disabled={busy === "accept"}>
                  Start Battle
                </Button>
                <Button variant="ghost" className="w-full text-rose-600 font-bold" onClick={() => rejectJoin(c.id)} loading={busy === "reject"}>
                  Reject Request
                </Button>
              </div>
            ) : (
              <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs font-bold text-amber-700">
                Waiting for the creator to accept and start…
              </p>
            )}
          </Panel>
        )}

        {/* Room Code Section */}
        {(c.status === "running" || c.status === "room_submitted" || c.status === "result_submitted") && inBattle && (
          <Panel title="Room Code">
            {c.roomCode ? (
              <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Ludo King Room Code</p>
                  <p className="font-mono text-lg font-black tracking-widest text-slate-900">{c.roomCode}</p>
                </div>
                <Button variant="ghost" onClick={() => { navigator.clipboard?.writeText(c.roomCode); }}>
                  Copy Code
                </Button>
              </div>
            ) : isCreator ? (
              <div className="space-y-2">
                <Input
                  label="Enter Room Code from Ludo King"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  placeholder="8-digit code"
                  inputMode="numeric"
                  maxLength={8}
                />
                <Button className="w-full" onClick={submitRoom} loading={busy === "room"} disabled={roomCode.length !== 8}>
                  Share Room Code
                </Button>
              </div>
            ) : (
              <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs font-bold text-amber-700">
                Waiting for the creator to share the room code…
              </p>
            )}
          </Panel>
        )}

        {/* Rules */}
        <Panel title="Rules">
          <ul className="list-disc space-y-1.5 pl-5 text-xs font-semibold leading-relaxed text-slate-600">
            <li>Both players must join the same Ludo King room with the code above.</li>
            <li>Do not leave a running match — leaving before it ends counts as a loss.</li>
            <li>Only a win claim needs a screenshot of the final result; a loss needs no proof.</li>
            <li>Play fair — cheating leads to a penalty and account suspension.</li>
          </ul>
        </Panel>

        {/* Result Submission */}
        {inBattle && !myReport && resultOpen && (
          <Panel title="Report Match Result">
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setOutcome("won")}
                  className={`rounded-xl py-3 text-xs font-black uppercase text-white transition-all ${outcome === "won" ? "bg-emerald-600 ring-4 ring-emerald-300" : "bg-emerald-600/70"}`}
                >
                  I Won
                </button>
                <button
                  type="button"
                  onClick={() => { setOutcome("lost"); setScreenshot(null); setScreenshotName(""); }}
                  className={`rounded-xl py-3 text-xs font-black uppercase text-white transition-all ${outcome === "lost" ? "bg-rose-600 ring-4 ring-rose-300" : "bg-rose-600/70"}`}
                >
                  I Lost
                </button>
                <button
                  type="button"
                  onClick={() => { setOutcome("cancel"); setScreenshot(null); setScreenshotName(""); }}
                  className={`rounded-xl py-3 text-xs font-black uppercase text-white transition-all ${outcome === "cancel" ? "bg-slate-600 ring-4 ring-slate-300" : "bg-slate-600/70"}`}
                >
                  Cancel
                </button>
              </div>

              {outcome === "won" && (
                <div className="flex items-center justify-between rounded-xl border border-gray-200 p-3 bg-gray-50">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Winning screenshot (required)</p>
                    <p className="truncate text-xs font-bold text-slate-700">{screenshotName || "No file chosen"}</p>
                  </div>
                  <label className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full bg-gray-100 px-4 py-2 text-xs font-extrabold text-slate-700 transition-all hover:bg-gray-200 active:scale-95">
                    {screenshot ? "Replace" : "Upload"}
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        pickScreenshot(file);
                      }}
                    />
                  </label>
                </div>
              )}

              <Button
                className="w-full"
                onClick={submitResultReport}
                loading={busy === "result"}
                disabled={!outcome || (outcome === "won" && !screenshot)}
              >
                Submit Result
              </Button>
            </div>
          </Panel>
        )}

        {inBattle && myReport && resultOpen && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm font-bold text-amber-700">
            Your result is submitted — waiting for opponent / admin.
          </div>
        )}

        {/* Back Link */}
        <div className="text-center pt-2">
          <button type="button" onClick={() => navigate("/battle")} className="text-xs font-extrabold text-slate-500 hover:underline">
            ← Back to Battles Lobby
          </button>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------------------- */
  /*                   2. LOBBY / BATTLES LIST VIEW (Main Route)                */
  /* -------------------------------------------------------------------------- */
  const openContests = openContestsQuery.data || [];
  const runningContests = runningContestsQuery.data || [];

  return (
    <div className="min-h-screen bg-[#eef3ff] px-3 pb-28 pt-6 text-slate-950">
      <div className="mx-auto max-w-md space-y-4">
        {/* Notice Header */}
        <div className="text-[11px] leading-relaxed text-white px-4 py-3 rounded-xl bg-black shadow-md">
          Proboss Ludo वेबसाइट पर आपका हार्दिक स्वागत है, दोस्तों, Withdrawal में कोई प्रोब्लम नहीं है (Super Fast Withdrawal ⏩)।
        </div>

        <h2 className="text-center text-base font-black uppercase text-slate-800">Create Battle</h2>

        {/* Create Input Box */}
        <div className="mx-2 rounded-[50px] bg-white p-2 shadow-md ring-1 ring-slate-200 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold">₹</div>
          <input
            type="number"
            placeholder="Enter Amount (e.g. 50, 100)"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm font-bold outline-none"
            value={betAmount}
            onChange={(e) => setBetAmount(e.target.value)}
          />
          <button
            disabled={busy === "create"}
            onClick={handleCreate}
            className="rounded-full bg-slate-900 px-5 py-2 text-xs font-black text-white active:scale-95 disabled:opacity-60"
          >
            {busy === "create" ? "..." : "Set"}
          </button>
        </div>

        {/* Open Battles Section */}
        <div className="space-y-2 pt-2">
          <h3 className="text-sm font-black uppercase text-slate-800 flex items-center gap-1">
            Open Battles ⚔️
          </h3>

          {openContestsQuery.isLoading ? (
            <Skeleton className="h-16 w-full rounded-xl" />
          ) : openContests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-6 text-center text-xs font-black text-slate-400">
              NO OPEN BATTLES AVAILABLE
            </div>
          ) : (
            openContests.map((b) => (
              <div key={b.id} className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200 p-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Entry Fee</p>
                  <p className="text-sm font-black text-slate-800">{formatPaise(b.stake)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Prize Pool</p>
                  <p className="text-sm font-black text-emerald-600">{formatPaise(b.prize)}</p>
                </div>
                <button
                  disabled={busy === "join"}
                  onClick={() => join(b.id)}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-black text-white active:scale-95 disabled:opacity-50"
                >
                  PLAY
                </button>
              </div>
            ))
          )}
        </div>

        {/* Running Battles Section */}
        <div className="space-y-2 pt-2">
          <h3 className="text-sm font-black uppercase text-slate-800 flex items-center gap-1">
            Running Battles ⚔️
          </h3>

          {runningContestsQuery.isLoading ? (
            <Skeleton className="h-16 w-full rounded-xl" />
          ) : runningContests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-6 text-center text-xs font-black text-slate-400">
              NO RUNNING BATTLES
            </div>
          ) : (
            runningContests.map((b) => (
              <div key={b.id} className="overflow-hidden rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
                <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_minmax(0,1fr)] items-center gap-2">
                  <p className="truncate text-center text-[10px] font-bold uppercase text-slate-700">
                    {b.players?.[0]?.name || "Player 1"}
                  </p>
                  <img
                    src="/battle-vs.png"
                    alt="versus"
                    className="h-14 w-14 object-contain drop-shadow-[0_0_8px_rgba(244,20,104,.2)]"
                  />
                  <p className="truncate text-center text-[10px] font-bold uppercase text-slate-700">
                    {b.players?.[1]?.name || "Player 2"}
                  </p>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
                  <p className="text-xs font-black text-slate-800">Prize: {formatPaise(b.prize)}</p>
                  <button
                    onClick={() => navigate(`/battle/${b.id}`)}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm"
                  >
                    VIEW
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/** One side of the battle header — avatar + name */
function PlayerHead({ player }) {
  const name = player?.name || "Searching…";
  return (
    <div className="flex w-24 flex-col items-center gap-1">
      <div className="h-14 w-14 overflow-hidden rounded-full bg-slate-700 ring-2 ring-white/20">
        <img
          src={player?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`}
          alt={name}
          className="h-full w-full object-cover"
        />
      </div>
      <p className="w-full truncate text-center text-xs font-black">{name}</p>
      {player?.isYou && <p className="text-[10px] font-bold text-white/40">You</p>}
    </div>
  );
}
