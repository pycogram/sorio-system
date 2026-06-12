"use client";
import Link from "next/link";

import { useState } from "react";
import { useWallet } from "../providers";
import { runApproveEmployee } from "./approve-action";
import { runCancel } from "../subscribe/[planPda]/cancel-action";
import useSWR from "swr";
import { fetcher } from "../lib/fetcher";

type HistoryRow = { amount: number; fee: number; status: string; salary_tx: string | null; paid_at: string };
type Item = {
  id: string;
  employee_wallet: string;
  amount: number;
  status: string;
  plan_pda: string | null;
  subscription_pda: string | null;
  next_payment_at: string | null;
  last_payment_at: string | null;
  payroll_history: HistoryRow[];
};
type Payroll = { id: string; name: string; period_seconds: number; hidden: boolean; payroll_items: Item[] };

const usd = (n: number) => `$${(n / 1_000_000).toFixed(2)}`;
const periodLabel = (s: number) =>
  s === 86400 ? "day" : s === 604800 ? "week" : s === 2592000 ? "month" : `${s / 3600}h`;
const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";

export function PayrollsOwned() {
  const { address } = useWallet();
  const [approving, setApproving] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [showRemoved, setShowRemoved] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [hidingId, setHidingId] = useState<string | null>(null);
  const [visible, setVisible] = useState(5);

  const { data, isLoading: loading, mutate } = useSWR(
    address ? `/api/payroll/list?wallet=${address}` : null,
    fetcher
  );
  const payrolls: Payroll[] | null = data ? data.payrolls ?? [] : null;

  async function refresh() {
    await mutate();
  }

  async function handleApprove(itemId: string) {
    setApproving(itemId);
    try {
      await runApproveEmployee({ itemId });
      await refresh();
    } catch (e: any) {
      const msg = e?.message ?? "";
      if (e?.code === 4001 || /reject/i.test(msg) || msg === "USER_CANCELLED") return;
      console.error("approve failed:", e);
      alert("Approve failed: " + msg);
    } finally {
      setApproving(null);
    }
  }

  async function handleRemove(item: Item) {
    if (!item.plan_pda || !item.subscription_pda) return;
    if (!confirm("Remove this employee? This revokes their payment authorization on-chain.")) return;
    setRemoving(item.id);
    try {
      await runCancel({ planPda: item.plan_pda, subscriptionPda: item.subscription_pda });
      await fetch("/api/payroll/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id }),
      });
      await refresh();
    } catch (e: any) {
      if (e?.message !== "USER_CANCELLED") {
        console.error("remove failed:", e);
        alert("Remove failed: " + (e?.message ?? e));
      }
    } finally {
      setRemoving(null);
    }
  }

  async function toggleHidden(p: Payroll) {
    if (!address) return;
    setHidingId(p.id);
    try {
      const res = await fetch(`/api/payroll/${p.id}/hide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: address, hidden: !p.hidden }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed to update payroll");
      }
      await refresh();
    } catch (e: any) {
      alert(e?.message ?? "Could not update payroll visibility.");
    } finally {
      setHidingId(null);
    }
  }

  const visiblePayrolls = payrolls?.filter((p) => !p.hidden) ?? [];
  const hiddenPayrolls = payrolls?.filter((p) => p.hidden) ?? [];
  const shownPayrolls = showHidden ? [...visiblePayrolls, ...hiddenPayrolls] : visiblePayrolls;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Payroll</h1>
        <Link href="/payroll/new" className="rounded-lg bg-[var(--btn)] px-4 py-2 text-sm font-medium text-[var(--btn-text)]">
          + New payroll
        </Link>
      </div>
      <p className="mt-1 text-sm text-[var(--muted)]">Payrolls paying out from your wallet.</p>

      {!address && <p className="mt-8 text-[var(--muted)]">Connect your wallet to view your payrolls.</p>}
      {address && loading && <p className="mt-8 text-[var(--muted)]">Loading…</p>}
      {address && payrolls && payrolls.length === 0 && (
        <p className="mt-8 text-[var(--muted)]">No payrolls yet. Create your first one.</p>
      )}

      {address && payrolls && payrolls.length > 0 && (
        <>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat
              label="Paid out"
              value={usd(
                payrolls.reduce(
                  (sum, p) =>
                    sum +
                    p.payroll_items.reduce(
                      (s, i) =>
                        s + (i.payroll_history ?? []).filter((h) => h.status === "success").reduce((hs, h) => hs + h.amount, 0),
                      0
                    ),
                  0
                )
              )}
            />
            <Stat label="Payrolls" value={String(visiblePayrolls.length)} />
            <Stat label="Employees" value={String(payrolls.reduce((n, p) => n + p.payroll_items.length, 0))} />
            <Stat
              label="Active"
              value={String(payrolls.reduce((n, p) => n + p.payroll_items.filter((i) => i.status === "active").length, 0))}
            />
          </div>

          {visiblePayrolls.length === 0 && !showHidden && hiddenPayrolls.length > 0 && (
            <p className="mt-8 text-sm text-[var(--muted)]">
              All your payrolls are hidden. Use “Show hidden payrolls” below to bring them back.
            </p>
          )}

          <div className="mt-8 space-y-5">
            {shownPayrolls.slice(0, visible).map((p) => {
              const period = periodLabel(p.period_seconds);
              const total = p.payroll_items.reduce((s, i) => s + i.amount, 0);
              const removedCount = p.payroll_items.filter((i) => i.status === "removed").length;
              const hiding = hidingId === p.id;
              return (
                <div
                  key={p.id}
                  className={`rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 ${p.hidden ? "opacity-60" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-lg font-semibold">{p.name}</p>
                        {p.hidden && (
                          <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                            Hidden
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-[var(--muted)]">
                        {p.payroll_items.length} {p.payroll_items.length === 1 ? "employee" : "employees"} · {usd(total)} / {period}
                      </p>
                    </div>
                    <button
                      onClick={() => toggleHidden(p)}
                      disabled={hiding}
                      className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs transition hover:border-[var(--primary)] disabled:opacity-50"
                    >
                      {hiding ? "…" : p.hidden ? "Unhide" : "Hide"}
                    </button>
                  </div>

                  <div className="mt-4 space-y-2">
                    {p.payroll_items
                      .filter((i) => (showRemoved ? true : i.status !== "removed"))
                      .map((i) => {
                        const paidCount = (i.payroll_history ?? []).filter((h) => h.status === "success").length;
                        const lastPaid = (i.payroll_history ?? [])
                          .filter((h) => h.status === "success")
                          .sort((a, b) => (a.paid_at < b.paid_at ? 1 : -1))[0];
                        return (
                          <div key={i.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm">
                            <div className="flex flex-col">
                              <span className="font-mono text-[var(--muted)]">{short(i.employee_wallet)}</span>
                              {paidCount > 0 && (
                                <span className="mt-0.5 text-xs text-[var(--muted)]">
                                  {paidCount} paid · last {fmtDate(lastPaid?.paid_at ?? null)}
                                </span>
                              )}
                            </div>
                            <span>{usd(i.amount)} / {period}</span>
                            {i.status === "active" ? (
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-[var(--accent)]">active ✓</span>
                                <button
                                  onClick={() => handleRemove(i)}
                                  disabled={removing === i.id}
                                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] transition hover:border-red-400 hover:text-red-500 disabled:opacity-50"
                                >
                                  {removing === i.id ? "Removing…" : "Remove"}
                                </button>
                              </div>
                            ) : i.status === "removed" ? (
                              <span className="text-xs text-[var(--muted)]">removed</span>
                            ) : (
                              <button
                                onClick={() => handleApprove(i.id)}
                                disabled={approving === i.id}
                                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs transition hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-50"
                              >
                                {approving === i.id ? "Approving…" : "Approve"}
                              </button>
                            )}
                          </div>
                        );
                      })}
                  </div>

                  {removedCount > 0 && (
                    <button
                      onClick={() => setShowRemoved((v) => !v)}
                      className="mt-3 text-xs text-[var(--primary)] hover:underline"
                    >
                      {showRemoved ? "Hide removed" : `Show removed (${removedCount})`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {visible < shownPayrolls.length && (
            <button
              onClick={() => setVisible((v) => v + 10)}
              className="mt-4 text-sm text-[var(--primary)] hover:underline"
            >
              View more ({shownPayrolls.length - visible} left)
            </button>
          )}

          {hiddenPayrolls.length > 0 && (
            <button
              onClick={() => {
                setShowHidden((v) => !v);
                setVisible(5);
              }}
              className="mt-6 block text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]"
            >
              {showHidden ? "Hide hidden payrolls" : `Show hidden payrolls (${hiddenPayrolls.length})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}