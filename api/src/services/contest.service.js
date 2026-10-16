import { Contest, CONTEST_STATES } from "../db/models/contest.model.js";
import { User } from "../db/models/user.model.js";
import { withTransaction } from "../db/connect.js";
import { withLock } from "../db/redis.js";
import {
  computePrize, computeReferralCommission, isTransitionAllowed, IllegalTransitionError,
  ConflictError, NotFoundError, ForbiddenError, BadRequestError, isValidStake,
  TERMINAL_STATES,
} from "../lib/shared/index.js";
import * as walletService from "./wallet.service.js";
import { emitContestUpdate, emitWalletUpdate } from "../realtime/io.js";
import { log } from "../config/logger.js";

const l = log("contest");

const OPEN_LIST_TTL = 3; // seconds — cache for /contests/open (fixes P2)
const OPEN_LIST_KEY = "contests:open:list:v1";
const BATTLE_OPEN_TTL_MS = 10 * 60 * 1000; // unjoined battles die in 10 min

/** Adda Ludo rule: a player may hold at most this many open (searching) battles. */
export const MAX_SEARCHING_BATTLES = 2;

function withWalletLocks(userIds, run) {
  const ids = [...new Set(userIds.map(String))].sort();
  const acquire = (index) => {
    if (index === ids.length) return run();
    return withLock(`wallet:${ids[index]}`, () => acquire(index + 1));
  };
  return acquire(0);
}

/**
 * Adda Ludo rule: a player with an unsubmitted active battle cannot start
 * another one. `result_submitted` / `cancel_requested` only block while the
 * player has not filed their own report yet.
 */
async function hasActiveUnsubmittedContest(userId) {
  const active = await Contest.find({
    "players.userId": userId,
    status: {
      $in: [
        CONTEST_STATES.JOIN_REQUESTED,
        CONTEST_STATES.RUNNING,
        CONTEST_STATES.ROOM_SUBMITTED,
        CONTEST_STATES.RESULT_SUBMITTED,
        CONTEST_STATES.CANCEL_REQUESTED,
      ],
    },
  }).select("status resultReports");

  return active.some((c) => {
    if (
      c.status === CONTEST_STATES.RESULT_SUBMITTED ||
      c.status === CONTEST_STATES.CANCEL_REQUESTED
    ) {
      return !(c.resultReports || []).some((r) => String(r.userId) === String(userId));
    }
    return true;
  });
}

/**
 * Adda Ludo rule: joining a battle auto-cancels the player's other open
 * battles (creators of the joined battle included). Their stakes are REFUNDED
 * inside each cancellation transaction — the reference app's version left the
 * money locked (C1).
 */
async function cancelOtherOpenBattles(userId, excludeContestId) {
  const others = await Contest.find({
    "players.userId": userId,
    status: CONTEST_STATES.OPEN,
    _id: { $ne: excludeContestId },
  }).select("_id stake");

  for (const other of others) {
    try {
      const out = await withLock(`contest:${other._id}`, () =>
        withTransaction(async (session) => {
          const fresh = await Contest.findOne({ _id: other._id }).session(session);
          if (!fresh || fresh.status !== CONTEST_STATES.OPEN) return null;
          fresh.transition(CONTEST_STATES.CANCELLED, {
            actor: userId,
            note: "auto-cancelled: another battle was joined",
          });
          await fresh.save({ session });
          let walletView = null;
          if (await walletService.hasEntryFeeHold({ userId: fresh.players[0].userId, contestId: fresh._id, session })) {
            walletView = await walletService.refundEntryFee({
              userId: fresh.players[0].userId,
              contestId: fresh._id,
              amountPaise: fresh.stake,
              note: "Battle auto-cancelled — stake refunded",
              session,
            });
          }
          await invalidateOpenList();
          return { contest: fresh, walletView };
        })
      );
      if (out) {
        emitContestUpdate(out.contest);
        if (out.walletView) emitWalletUpdate(userId, out.walletView);
        l.info({ contestId: String(other._id), userId: String(userId) }, "open battle auto-cancelled on join");
      }
    } catch (err) {
      l.error({ contestId: String(other._id), err: err.message }, "auto-cancel of other open battle failed");
    }
  }
  return others.length;
}

/**
 * Create a searchable battle without touching the creator's wallet. Stakes
 * are held atomically for both players only after the creator starts the match.
 */
export async function createContest({ userId, stakePaise, ip }) {
  if (!isValidStake(stakePaise)) throw new BadRequestError("Unknown stake amount");

  // Adda Ludo guards: one active battle at a time, max 2 open, no same amount twice
  if (await hasActiveUnsubmittedContest(userId)) {
    throw new ConflictError("You have an active battle. Submit its result before starting a new one");
  }
  const openMine = await Contest.find({ "players.userId": userId, status: CONTEST_STATES.OPEN }).select("stake");
  if (openMine.some((c) => c.stake === stakePaise)) {
    throw new ConflictError(`You already have an open battle of ₹${stakePaise / 100}. Choose a different amount`);
  }
  if (openMine.length >= MAX_SEARCHING_BATTLES) {
    throw new ConflictError("Maximum 2 open battles allowed. Cancel one first");
  }

  return withLock(`wallet:${userId}`, () =>
    withTransaction(async (session) => {
      await walletService.assertAvailable(userId, stakePaise, { session });
      const [contest] = await Contest.create(
        [{
          stake: stakePaise,
          status: CONTEST_STATES.OPEN,
          players: [{ userId, seat: 1, joinedAt: new Date(), joinedIp: ip }],
          expiresAt: new Date(Date.now() + BATTLE_OPEN_TTL_MS),
        }],
        { session }
      );
      await invalidateOpenList();
      l.info({ contestId: String(contest._id), userId: String(userId), stakePaise }, "contest created");
      return contest;
    })
  );
}

/** A second player requests to join; no money moves until the creator starts. */
export async function joinContest({ userId, contestId, ip }) {
  // Adda Ludo guard: no new bets while an active battle is pending
  if (await hasActiveUnsubmittedContest(userId)) {
    throw new ConflictError("You have an active battle. Submit its result before joining a new one");
  }

  return withLock(`contest:${contestId}`, () =>
    withTransaction(async (session) => {
        const contest = await Contest.findOne({ _id: contestId }).session(session);
        if (!contest) throw new NotFoundError("Battle not found");
        if (contest.status !== CONTEST_STATES.OPEN) throw new ConflictError("Battle is not open to join");
        if (contest.isParticipant(userId)) throw new ConflictError("You already own this battle");

        // A player cannot join a battle whose entry fee exceeds their available
        // balance — enforce on the server too, not just in the UI.
        await walletService.assertAvailable(userId, contest.stake, { session });

        contest.players.push({ userId, seat: 2, joinedAt: new Date(), joinedIp: ip });
        contest.transition(CONTEST_STATES.JOIN_REQUESTED, { actor: userId, note: "second player seated" });
        await contest.save({ session });

        await invalidateOpenList();
        l.info({ contestId: String(contestId), userId: String(userId), stake: contest.stake }, "contest join requested");
        return contest;
      })
  );
}

/** The creator accepts a pending request and locks both stakes atomically. */
export async function acceptContest({ userId, contestId }) {
  const outcome = await withLock(`contest:${contestId}`, async () => {
    const snapshot = await Contest.findById(contestId).select("players.userId");
    if (!snapshot) throw new NotFoundError("Battle not found");
    const participantIds = snapshot.players.map((player) => player.userId);

    return withWalletLocks(participantIds, () =>
      withTransaction(async (session) => {
        const contest = await Contest.findById(contestId).session(session);
        if (!contest) throw new NotFoundError("Battle not found");
        if (contest.status !== CONTEST_STATES.JOIN_REQUESTED) {
          throw new ConflictError("There is no pending join request to accept");
        }
        const creator = contest.players.find((player) => player.seat === 1);
        const joiner = contest.players.find((player) => player.seat === 2);
        if (!creator || !joiner) throw new ConflictError("Battle is missing a player");
        if (String(creator.userId) !== String(userId)) throw new ForbiddenError("Only the battle creator can start it");

        for (const player of [creator, joiner]) {
          await walletService.holdEntryFee({
            userId: player.userId,
            contestId: contest._id,
            amountPaise: contest.stake,
            session,
          });
        }
        contest.transition(CONTEST_STATES.RUNNING, { actor: userId, note: "creator accepted join request" });
        await contest.save({ session });
        await invalidateOpenList();
        return { contest, creatorId: creator.userId, joinerId: joiner.userId };
      })
    );
  });

  const creatorView = await walletService.walletView(outcome.creatorId);
  const joinerView = await walletService.walletView(outcome.joinerId);
  emitWalletUpdate(outcome.creatorId, creatorView);
  emitWalletUpdate(outcome.joinerId, joinerView);

  await cancelOtherOpenBattles(outcome.creatorId, contestId);
  await cancelOtherOpenBattles(outcome.joinerId, contestId);
  return outcome.contest;
}

/** The creator rejects a request; the joiner is removed and the listing reopens. */
export async function rejectContest({ userId, contestId }) {
  return withLock(`contest:${contestId}`, () =>
    withTransaction(async (session) => {
      const contest = await Contest.findById(contestId).session(session);
      if (!contest) throw new NotFoundError("Battle not found");
      if (contest.status !== CONTEST_STATES.JOIN_REQUESTED) {
        throw new ConflictError("There is no pending join request to reject");
      }
      const creator = contest.players.find((player) => player.seat === 1);
      if (!creator || String(creator.userId) !== String(userId)) {
        throw new ForbiddenError("Only the battle creator can reject a join request");
      }
      contest.players = contest.players.filter((player) => player.seat !== 2);
      contest.transition(CONTEST_STATES.OPEN, { actor: userId, note: "creator rejected join request" });
      await contest.save({ session });
      await invalidateOpenList();
      return contest;
    })
  );
}

/**
 * Share the Ludo King room code. Only the two participants may ever see it,
 * and it is stripped from list responses (fixes S2/S3 leakage).
 */
export async function submitRoomCode({ userId, contestId, roomCode }) {
  return withLock(`contest:${contestId}`, () =>
    withTransaction(async (session) => {
      const contest = await Contest.findOne({ _id: contestId }).session(session);
      if (!contest) throw new NotFoundError("Battle not found");
      if (!contest.isParticipant(userId)) throw new ForbiddenError("Not your battle");
      if (contest.status !== CONTEST_STATES.RUNNING) throw new ConflictError("Battle is not running");

      contest.set("roomCode", roomCode.trim());
      contest.set("roomCodeUp", roomCode.trim().toUpperCase());
      contest.set("roomSubmittedBy", userId);
      contest.set("roomSubmittedAt", new Date());
      await contest.save({ session });
      return true;
    })
  );
}

/** All ledger rows for this contest (admin dispute screen / debugging). */
export async function contestLedger(contestId) {
  const { LedgerEntry } = await import("../db/models/ledgerEntry.model.js");
  return LedgerEntry.find({ refType: "contest", refId: contestId }).sort({ createdAt: 1 }).lean();
}

/** Participant submits the result; an admin/system settle follows. */
export async function submitResult({ userId, contestId, outcome, screenshotKeys = [] }) {
  return withLock(`contest:${contestId}`, () =>
    withTransaction(async (session) => {
      const contest = await Contest.findOne({ _id: contestId }).session(session);
      if (!contest) throw new NotFoundError("Battle not found");
      if (!contest.isParticipant(userId)) throw new ForbiddenError("Not your battle");

      const allowed = [CONTEST_STATES.RUNNING, CONTEST_STATES.ROOM_SUBMITTED, CONTEST_STATES.RESULT_SUBMITTED];
      if (!allowed.includes(contest.status)) {
        throw new ConflictError(`Cannot submit a result from status "${contest.status}"`);
      }

      if (outcome === "cancel") {
        contest.conflict = {
          active: true,
          raisedBy: userId,
          reason: "player requested cancel",
          autoRefundAt: new Date(Date.now() + conflictRefundHours() * 3600_000),
        };
        contest.markModified("conflict");
        contest.transition(CONTEST_STATES.CANCEL_REQUESTED, { actor: userId, note: "cancel requested" });
      } else {
        if (contest.status !== CONTEST_STATES.RESULT_SUBMITTED) {
          contest.transition(CONTEST_STATES.RESULT_SUBMITTED, { actor: userId, note: "result submitted" });
        }
        contest.set("winnerUserId", outcome === "won" ? userId : null);
      }

      // keep each player's own claim + proof screenshots (never trust a single side's word alone)
      contest.resultReports = contest.resultReports || [];
      contest.resultReports.push({
        userId,
        outcome,
        reportedAt: new Date(),
        screenshots: (screenshotKeys || []).map((key) => ({
          key,
          uploadedBy: userId,
          uploadedAt: new Date(),
        })),
      });
      await contest.save({ session });
      return contest;
    })
  );
}

/**
 * THE settlement primitive — payout or refund, always transactional + idempotent.
 * Order (fixes C4): money moves FIRST, status flips to APPROVED last.
 */
export async function settleContest({ contestId, winnerUserId, settledBy, session }) {
  const contest = await Contest.findOne({ _id: contestId }).session(session);
  if (!contest) throw new NotFoundError("Battle not found");
  if (contest.settlement?.settledAt) return { contest, alreadySettled: true };

  const winner = contest.players.find((p) => p.userId.toString() === winnerUserId.toString());
  if (!winner) throw new BadRequestError("Winner is not a participant of this battle");
  const loser = contest.players.find((p) => p.userId.toString() !== winnerUserId.toString());
  if (!loser) throw new BadRequestError("Battle needs both players present before settling");

  const b = computePrize(contest.stake);
  await walletService.releaseEntryFee({ userId: winner.userId, contestId, amountPaise: contest.stake, session });
  const loserWallet = await walletService.consumeEntryFee({ userId: loser.userId, contestId, amountPaise: contest.stake, session });
  const wallet = await walletService.creditPrize({
    userId: winner.userId, contestId, amountPaise: b.prizePaise, settledBy, session,
  });

  // lifetime referral commission: 2% of the winner's stake to their referrer
  // (same transaction + idempotency key, so a retried settle pays it exactly once)
  const winnerDoc = await User.findById(winner.userId).select("referral.referredBy").session(session);
  const referrerId = winnerDoc?.referral?.referredBy || null;
  let referrerWallet = null;
  if (referrerId) {
    const commissionPaise = computeReferralCommission(contest.stake);
    if (commissionPaise > 0) {
      referrerWallet = await walletService.creditReferralCommission({
        referrerId, referredUserId: winner.userId, contestId: contest._id,
        amountPaise: commissionPaise, session,
      });
    }
  }

  contest.settlement = {
    prizePaise: b.prizePaise,
    commissionPaise: b.commissionPaise,
    settledAt: new Date(),
    settledBy,
  };
  contest.set("winnerUserId", winner.userId);
  contest.transition(CONTEST_STATES.APPROVED, { actor: settledBy, note: "settled" });
  await contest.save({ session });

  l.info(
    { contestId: String(contestId), winner: String(winner.userId), prizePaise: b.prizePaise, settledBy },
    "contest settled"
  );
  return { contest, wallet, loserWallet, referrerId, referrerWallet };
}

/** Admin/system verdict on a submitted result. */
export async function decideContest({ contestId, winnerUserId, settledBy = "admin" }) {
  const result = await withLock(`contest:${contestId}`, () =>
    withTransaction(async (session) => settleContest({ contestId, winnerUserId, settledBy, session }))
  );
  if (result) {
    emitContestUpdate(result.contest);
    if (result.wallet) emitWalletUpdate(winnerUserId, result.wallet);
    if (result.loserWallet) {
      const loserId = result.contest.players.find((p) => p.userId.toString() !== winnerUserId.toString())?.userId;
      if (loserId) emitWalletUpdate(loserId, result.loserWallet);
    }
    // the winner's referrer earned a commission in the same transaction
    if (result.referrerId && result.referrerWallet) emitWalletUpdate(result.referrerId, result.referrerWallet);
  }
  return result;
}

/** Cancel an unmatched battle, or let a requester withdraw without a charge. */
export async function cancelContest({ userId, contestId }) {
  return withLock(`contest:${contestId}`, () =>
    withTransaction(async (session) => {
      const contest = await Contest.findOne({ _id: contestId }).session(session);
      if (!contest) throw new NotFoundError("Battle not found");
      if (!contest.isParticipant(userId)) throw new ForbiddenError("Not your battle");
      if (contest.status === CONTEST_STATES.JOIN_REQUESTED) {
        const joiner = contest.players.find((player) => player.seat === 2);
        const creator = contest.players.find((player) => player.seat === 1);
        if (joiner && String(joiner.userId) === String(userId)) {
          contest.players = contest.players.filter((player) => player.seat !== 2);
          contest.transition(CONTEST_STATES.OPEN, { actor: userId, note: "join request withdrawn" });
          await contest.save({ session });
          await invalidateOpenList();
          return { contest, walletViews: {} };
        }
        if (!creator || String(creator.userId) !== String(userId)) throw new ForbiddenError("Not your battle");
      }
      if (!isTransitionAllowed(contest.status, CONTEST_STATES.CANCELLED)) {
        throw new ConflictError(`A battle in "${contest.status}" cannot be cancelled`);
      }
      // refund EVERY participant who has a hold (refund_both), not just the canceller
      const walletViews = {};
      for (const p of contest.players) {
        if (await walletService.hasEntryFeeHold({ userId: p.userId, contestId, session })) {
          const view = await walletService.refundEntryFee({
            userId: p.userId, contestId, amountPaise: contest.stake,
            note: "Battle cancelled — stake refunded", session,
          });
          walletViews[String(p.userId)] = view;
        }
      }
      contest.transition(CONTEST_STATES.CANCELLED, { actor: userId, note: "cancelled by player" });
      await contest.save({ session });
      await invalidateOpenList();
      return { contest, walletViews };
    })
  );
}

/** Refund every participant from a cancelled/failed battle (admin + SLA path). */
export async function refundAllContest({ contestId, settledBy = "system", session }) {
  const contest = await Contest.findOne({ _id: contestId }).session(session);
  if (!contest) throw new NotFoundError("Battle not found");
  if (contest.settlement?.settledAt) return { contest, alreadySettled: true };

  const walletViews = {};
  for (const p of contest.players) {
    if (await walletService.hasEntryFeeHold({ userId: p.userId, contestId, session })) {
      const view = await walletService.refundEntryFee({
        userId: p.userId, contestId, amountPaise: contest.stake,
        note: "Battle cancelled — stake refunded", session,
      });
      walletViews[String(p.userId)] = view;
    }
  }
  contest.settlement = { settledAt: new Date(), settledBy };
  contest.transition(CONTEST_STATES.CANCELLED, { actor: settledBy, note: "refunded all players" });
  await contest.save({ session });
  return { contest, walletViews };
}

/** Auto-refund stale conflicts (SLA sweep — fixes C8-style stuck money). */
export async function expireStaleConflicts() {
  const stale = await Contest.find({
    "conflict.active": true,
    "conflict.autoRefundAt": { $lte: new Date() },
  }).limit(50);

  let refunded = 0;
  for (const c of stale) {
    try {
      const out = await withLock(`contest:${c._id}`, () =>
        withTransaction(async (session) => {
          const fresh = await Contest.findOne({ _id: c._id }).session(session);
          if (!fresh || fresh.settlement?.settledAt || !fresh.conflict?.active) return null;
          const result = await refundAllContest({ contestId: fresh._id, settledBy: "sla", session });
          result.contest.set("conflict.active", false);
          await result.contest.save({ session });
          return result;
        })
      );
      if (out && !out.alreadySettled) {
        emitContestUpdate(out.contest);
        for (const p of out.contest.players) {
          const view = out.walletViews?.[String(p.userId)];
          if (view) emitWalletUpdate(p.userId, view);
        }
      }
      refunded += 1;
    } catch (err) {
      l.error({ contestId: String(c._id), err: err.message }, "SLA auto-refund failed");
    }
  }
  if (stale.length) l.info({ scanned: stale.length, refunded }, "SLA conflict sweep done");
  return refunded;
}

/** Force-expire an open battle from the admin panel. */
export async function expireContestById(contestId, actor = "admin") {
  return withLock(`contest:${contestId}`, () =>
    withTransaction(async (session) => {
      const contest = await Contest.findOne({ _id: contestId }).session(session);
      if (!contest) throw new NotFoundError("Battle not found");
      if (contest.status !== CONTEST_STATES.OPEN) {
        throw new ConflictError(`Only open battles can be expired (this one is "${contest.status}")`);
      }
      contest.transition(CONTEST_STATES.EXPIRED, { actor, note: "force-expired" });
      await contest.save({ session });
      let walletView = null;
      if (await walletService.hasEntryFeeHold({ userId: contest.players[0].userId, contestId, session })) {
        walletView = await walletService.refundEntryFee({
          userId: contest.players[0].userId, contestId, amountPaise: contest.stake,
          note: "Battle expired — stake refunded", session,
        });
      }
      await invalidateOpenList();
      return { contest, walletView, creatorId: contest.players[0].userId };
    })
  );
}

/** Refund all players of a running/cancel-requested battle (admin dispute path). */
export async function refundContestById(contestId, actor = "admin") {
  const out = await withLock(`contest:${contestId}`, () =>
    withTransaction(async (session) => {
      const fresh = await Contest.findOne({ _id: contestId }).session(session);
      if (!fresh) throw new NotFoundError("Battle not found");
      if (fresh.settlement?.settledAt) throw new ConflictError("Battle is already settled");
      if (TERMINAL_STATES.includes(fresh.status)) throw new ConflictError(`Battle is already ${fresh.status}`);
      const result = await refundAllContest({ contestId, settledBy: actor, session });
      result.contest.set("conflict.active", false);
      await result.contest.save({ session });
      return result;
    })
  );
  if (out && !out.alreadySettled) {
    emitContestUpdate(out.contest);
    for (const p of out.contest.players) {
      const view = out.walletViews?.[String(p.userId)];
      if (view) emitWalletUpdate(p.userId, view);
    }
  }
  return out;
}

/**
 * Expire unmatched listings, including expired pending requests. Legacy held
 * stakes are refunded when present; new listings do not reserve money.
 */
export async function expireStaleOpenContests() {
  const stale = await Contest.find({
    status: { $in: [CONTEST_STATES.OPEN, CONTEST_STATES.JOIN_REQUESTED] },
    expiresAt: { $lte: new Date() },
  })
    .limit(100)
    .select("_id")
    .lean();

  let expired = 0;
  for (const c of stale) {
    try {
      const result = await withLock(`contest:${c._id}`, () =>
        withTransaction(async (session) => {
          const fresh = await Contest.findOne({ _id: c._id }).session(session);
          if (!fresh || ![CONTEST_STATES.OPEN, CONTEST_STATES.JOIN_REQUESTED].includes(fresh.status)) return null;
          if (fresh.status === CONTEST_STATES.JOIN_REQUESTED) {
            fresh.players = fresh.players.filter((player) => player.seat === 1);
            fresh.transition(CONTEST_STATES.OPEN, { actor: "system", note: "expired request cleared" });
          }
          fresh.transition(CONTEST_STATES.EXPIRED, { actor: "system", note: "expired: no opponent joined" });
          await fresh.save({ session });
          let walletView = null;
          if (await walletService.hasEntryFeeHold({ userId: fresh.players[0].userId, contestId: fresh._id, session })) {
            walletView = await walletService.refundEntryFee({
              userId: fresh.players[0].userId, contestId: fresh._id, amountPaise: fresh.stake,
              note: "Battle expired — stake refunded", session,
            });
          }
          await invalidateOpenList();
          return { contest: fresh, walletView, creatorId: fresh.players[0].userId };
        })
      );
      if (result) {
        emitContestUpdate(result.contest);
        if (result.walletView) emitWalletUpdate(result.creatorId, result.walletView);
      }
      expired += 1;
    } catch (err) {
      l.error({ contestId: String(c._id), err: err.message }, "open-battle expiry failed");
    }
  }
  if (stale.length) l.info({ scanned: stale.length, expired }, "open-battle expiry sweep done");
  return expired;
}

/**
 * List currently-open contests for the lobby.
 * Read path is cached (fixes P2 — bounded, no writes on hot refresh): the full
 * open set is cached for OPEN_LIST_TTL seconds and invalidated on every write.
 * Cached entries are hydrated back into Mongoose documents so contestDto()
 * instance methods (isParticipant) keep working on cache hits.
 * @param {{ page: number, limit: number }} opts
 * @returns {Promise<{ items: mongoose.Document[], total: number }>}
 */
export async function listOpenContests({ page, limit }) {
  const cached = await readOpenListCache();

  let items, total;
  if (cached) {
    total = cached.total;
    const skip = (page - 1) * limit;
    const pageDocs = cached.items.slice(skip, skip + limit);
    items = pageDocs.map((doc) => Contest.hydrate(doc));
  } else {
    const filter = { status: CONTEST_STATES.OPEN, expiresAt: { $gt: new Date() } };
    total = await Contest.countDocuments(filter);
    const all = await Contest.find(filter).sort({ createdAt: -1 }).lean();
    if (all.length) await writeOpenListCache(all, total);
    const skip = (page - 1) * limit;
    const pageDocs = all.slice(skip, skip + limit);
    items = pageDocs.map((doc) => Contest.hydrate(doc));
  }

  // always attach the creator's 5-letter player handle, cache or not
  await Contest.populate(items, { path: "players.userId", select: "name" });
  return { items, total };
}

/**
 * List contests the given user participates in (any status), newest first.
 * @param {string} userId
 * @param {{ page: number, limit: number }} opts
 * @returns {Promise<{ items: mongoose.Document[], total: number }>}
 */
export async function listMyContests(userId, { page, limit }) {
  const filter = { "players.userId": userId };
  const [items, total] = await Promise.all([
    Contest.find(filter).sort({ createdAt: -1 }).select("+roomCode").populate("players.userId", "name")
      .skip((page - 1) * limit).limit(limit),
    Contest.countDocuments(filter),
  ]);
  return { items, total };
}

/** Cache helpers for the open list (fixes P2 — bounded, cached, no writes in the read path). */

/** Invalidate the open list cache — called on every write that affects open battles. */
export async function invalidateOpenList() {
  const { redis } = await import("../db/redis.js");
  await redis.del(OPEN_LIST_KEY);
}

async function readOpenListCache() {
  try {
    const { redis } = await import("../db/redis.js");
    const raw = await redis.get(OPEN_LIST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { total: parsed.total, items: parsed.items };
  } catch {
    return null;
  }
}

async function writeOpenListCache(items, total) {
  try {
    const { redis } = await import("../db/redis.js");
    await redis.set(OPEN_LIST_KEY, JSON.stringify({ total, items }), "EX", OPEN_LIST_TTL);
  } catch {
    // cache write failure is non-fatal — the DB result still gets returned to the caller
  }
}

function conflictRefundHours() {
  return Number(process.env.CONFLICT_REFUND_HOURS || 12);
}

export { OPEN_LIST_KEY, OPEN_LIST_TTL };
