import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { rupeesToPaise } from "../lib/money.js";
import { useToast } from "../components/Toast.jsx";
import { Button, Card, Input, Money, PageHeading, Skeleton, Table } from "../components/ui.jsx";

const KINDS = [
  { value: "open", label: "Open Battles", hint: "Shown in the player lobby's Open Battles section — disappears when a real player tries to join." },
  { value: "running", label: "Running Battles", hint: "Shown in the Running Battles section as a live match — has two fake players, not clickable." },
];

/**
 * Dummy battles — admin "social proof" tables. Open dummies sit in the player
 * lobby's Open Battles list (a real player clicking one removes it); running
 * dummies sit in the Running Battles list as live matches. None are ever
 * actually playable.
 */
export default function DummyBattles() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [kind, setKind] = useState("open");
  const [stake, setStake] = useState("");
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [opponentName, setOpponentName] = useState("");

  const list = useQuery({
    queryKey: ["dummy-contests"],
    queryFn: () => api("/admin/dummy-contests"),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["dummy-contests"] });

  const create = useMutation({
    mutationFn: () =>
      api("/admin/dummy-contests", {
        method: "POST",
        body: {
          stake: rupeesToPaise(stake),
          name: name.trim(),
          mobile: mobile.trim() || undefined,
          kind,
          opponentName: kind === "running" ? opponentName.trim() || undefined : undefined,
        },
      }),
    onSuccess: () => {
      toast.success(kind === "running" ? "Dummy running battle added" : "Dummy open battle added");
      setStake(""); setName(""); setMobile(""); setOpponentName("");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: (id) => api(`/admin/dummy-contests/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Dummy battle removed"); invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  const items = list.data?.items || [];
  const openCount = items.filter((i) => i.kind === "open").length;
  const runningCount = items.filter((i) => i.kind === "running").length;

  function add() {
    if (!name.trim()) return toast.error("Enter a player name");
    let stakePaise;
    try {
      stakePaise = rupeesToPaise(stake);
    } catch {
      return toast.error("Enter a valid amount (₹50–₹1,00,000, multiples of ₹50)");
    }
    if (stakePaise % 5000 !== 0) {
      return toast.error("Amount must be a multiple of ₹50");
    }
    create.mutate();
  }

  return (
    <div className="space-y-4">
      <PageHeading
        title="Dummy battles"
        subtitle={`${openCount} open · ${runningCount} running — social-proof tables`}
      />

      <Card>
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-[#7a3d58]">Create a dummy battle</p>

        {/* where the dummy shows up */}
        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => setKind(k.value)}
              className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
                kind === k.value
                  ? "border-[#db2777] bg-[#fce4ee] shadow-[0_4px_12px_rgba(219,39,119,0.15)]"
                  : "border-[#f0c2d8] bg-white hover:border-[#e295b5]"
              }`}
            >
              <p className={`text-sm font-extrabold ${kind === k.value ? "text-[#be185d]" : "text-[#2a1520]"}`}>
                {k.label}
              </p>
              <p className="mt-0.5 text-[11px] font-semibold text-[#a56a83]">{k.hint}</p>
            </button>
          ))}
        </div>

        <div className="grid gap-2 sm:grid-cols-4">
          <Input label="Player name" value={name} onChange={(e) => setName(e.target.value)} placeholder="ROHIT_99" />
          <Input label="Amount (₹)" value={stake} onChange={(e) => setStake(e.target.value)} placeholder="500" inputMode="numeric" />
          {kind === "open" ? (
            <Input label="Mobile (fake)" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))} maxLength={10} placeholder="Optional" />
          ) : (
            <Input label="Opponent name" value={opponentName} onChange={(e) => setOpponentName(e.target.value)} placeholder="Auto if blank" />
          )}
          <div className="flex items-end">
            <Button className="w-full" disabled={create.isPending} onClick={add}>{create.isPending ? "Adding…" : "Add"}</Button>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-[#a56a83]">
          {kind === "open"
            ? "Appears instantly in the player lobby's Open Battles section and vanishes if a real player tries to join it."
            : "Appears instantly in the Running Battles section as a live match. Players can see it but not open or join it."}
        </p>
      </Card>

      <Card>
        {list.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : list.isError ? (
          <p className="py-6 text-center text-sm font-bold text-rose-600">{list.error?.message}</p>
        ) : (
          <Table
            columns={[
              { key: "kind", label: "Shown in", render: (r) => (
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${r.kind === "running" ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-sky-50 text-sky-700 ring-1 ring-sky-200"}`}>
                  {r.kind === "running" ? "Running" : "Open"}
                </span>
              ) },
              { key: "name", label: "Player 1", render: (r) => <span className="font-bold text-[#2a1520]">{r.name}</span> },
              { key: "opponentName", label: "Player 2", render: (r) => (r.kind === "running" ? (r.opponentName || "—") : "—") },
              { key: "mobile", label: "Mobile", render: (r) => r.mobile || "—" },
              { key: "stake", label: "Amount", render: (r) => <Money paise={r.stake} /> },
              { key: "createdAt", label: "Created", render: (r) => (r.createdAt ? new Date(r.createdAt).toLocaleString("en-IN") : "—") },
              { key: "_actions", label: "", render: (r) => <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate(r.id)}>Remove</Button> },
            ]}
            data={items}
            empty="No dummy battles — add one above"
          />
        )}
      </Card>
    </div>
  );
}