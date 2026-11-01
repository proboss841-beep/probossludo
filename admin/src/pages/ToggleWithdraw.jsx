import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { useToast } from "../components/Toast.jsx";
import { Card, PageHeading, Skeleton } from "../components/ui.jsx";
import { authState } from "../lib/auth.js";

/**
 * Toggle Withdraw — a single-purpose page to switch player withdrawals
 * ON/OFF and set the note players see while they are OFF.
 *
 * When OFF the player-facing Wallet shows `withdrawalNote` and the withdraw
 * API rejects new requests, so no withdrawal can go through.
 * Saving is a superadmin-only action (same guard as the rest of Settings).
 */
export default function ToggleWithdraw() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const isSuperadmin = authState().user?.role === "superadmin";

  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api("/admin/settings") });
  const [enabled, setEnabled] = useState(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (settings.data) {
      setEnabled(settings.data.withdrawalsEnabled !== false);
      setNote(settings.data.withdrawalNote || "");
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () =>
      api("/admin/settings", {
        method: "POST",
        body: { withdrawalsEnabled: enabled, withdrawalNote: note.trim() },
      }),
    onSuccess: () => {
      toast.success(enabled ? "Withdrawals turned ON" : "Withdrawals turned OFF");
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) => toast.error(err.message),
  });

  if (settings.isLoading || enabled === null) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (settings.isError) {
    return (
      <Card>
        <p className="py-6 text-center text-sm font-bold text-rose-600">{settings.error?.message}</p>
      </Card>
    );
  }

  return (
    <div>
      <PageHeading
        title="Toggle Withdraw"
        subtitle="Allow or block player withdrawals with one switch"
        action={
          isSuperadmin ? (
            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={save.isPending || (settings.data?.withdrawalsEnabled === enabled && (settings.data?.withdrawalNote || "") === note.trim())}
              className="rounded-xl bg-gradient-to-br from-[#ec4899] to-[#db2777] px-4 py-2 text-xs font-extrabold text-white shadow-[0_6px_14px_rgba(219,39,119,0.3)] transition-all hover:brightness-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {save.isPending ? "Saving…" : "Save"}
            </button>
          ) : undefined
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          {/* Master switch */}
          <div className="rounded-2xl border border-[#f0c2d8] bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-extrabold text-[#2a1520]">
                  Withdrawals {enabled ? "ON" : "OFF"}
                </p>
                <p className="mt-0.5 text-xs font-semibold text-[#a56a83]">
                  {enabled
                    ? "Players can request withdrawals normally."
                    : "Players are blocked from withdrawing and see your note instead."}
                </p>
              </div>
              {/* toggle switch */}
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                disabled={!isSuperadmin}
                onClick={() => setEnabled((v) => !v)}
                className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${
                  enabled ? "bg-emerald-500" : "bg-rose-400"
                } ${isSuperadmin ? "cursor-pointer" : "opacity-60"}`}
              >
                <span
                  className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${
                    enabled ? "left-7" : "left-1"
                  }`}
                />
              </button>
            </div>

            <div className={`mt-4 rounded-xl px-3 py-2.5 text-lg font-black tracking-tight ${enabled ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}>
              {enabled ? "Players can withdraw money" : "Withdrawals are blocked"}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-[#f0c2d8] bg-white p-5 shadow-sm">
            <p className="text-base font-extrabold text-[#2a1520]">What players see while OFF</p>
            <p className="mt-0.5 text-xs font-semibold text-[#a56a83]">
              The withdraw tab is replaced by this message the moment you switch withdrawals off.
            </p>

            {/* note box under the toggle */}
            <div className="mt-3">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={!isSuperadmin}
                rows={4}
                maxLength={300}
                placeholder="Withdrawals are temporarily disabled. Please try again later."
                className="w-full resize-none rounded-xl border border-[#f0c2d8] bg-white px-3 py-2.5 text-sm font-semibold text-[#2a1520] outline-none transition-colors placeholder:text-[#c9a0b3] focus:border-[#db2777] disabled:opacity-60"
              />
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[#a56a83]">
                  Max 300 characters — saved with the switch.
                </span>
                <span className={`text-[11px] font-bold ${note.length >= 290 ? "text-rose-500" : "text-[#c9a0b3]"}`}>
                  {note.length}/300
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Preview + how it works */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-[#f0c2d8] bg-white p-5 shadow-sm">
            <p className="text-base font-extrabold text-[#2a1520]">Player preview</p>
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-center">
              <svg className="mx-auto mb-1 h-6 w-6 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v4m0 4h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z" />
              </svg>
              <p className="text-sm font-black text-rose-700">
                {enabled ? "Withdrawals are currently ON" : "Withdrawals are currently off"}
              </p>
              <p className="mt-1 text-xs font-semibold text-rose-600">{note.trim() || "…"}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-[#f0c2d8] bg-white p-5 text-xs font-semibold text-[#7a3d58] shadow-sm">
            <p className="mb-2 text-sm font-extrabold text-[#2a1520]">How it works</p>
            <ul className="list-disc space-y-1.5 pl-4">
              <li>While OFF, players who tap Withdraw see your note instead of the withdraw form.</li>
              <li>The withdraw API also rejects requests when OFF, so no withdrawal can slip through.</li>
              <li>Switch it ON whenever you want players to withdraw normally again — no page reload needed on their phone.</li>
            </ul>
          </div>
        </div>
      </div>

      {!isSuperadmin && (
        <p className="mt-4 rounded-xl border border-[#f0c2d8] bg-white px-4 py-3 text-xs font-semibold text-[#7a3d58]">
          Read-only — only a superadmin can change the withdrawal switch.
        </p>
      )}
    </div>
  );
}