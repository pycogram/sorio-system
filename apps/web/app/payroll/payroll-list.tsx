"use client";

import { useEffect, useState } from "react";
import { useWallet } from "../providers";
import { runApproveEmployee } from "./approve-action";

type HistoryRow = {
  amount: number;
  fee: number;
  status: string;
  salary_tx: string | null;
  paid_at: string;
};
type Item = {
  id: string;
  employee_wallet: string;
  amount: number;
  status: string;
  next_payment_at: string | null;
  last_payment_at: string | null;
  payroll_history: HistoryRow[];
};
type Payroll = {
  id: string;
  name: string;
  period_seconds: number;
  payroll_items: Item[];
};

const usd = (n: number) => `$${(n / 1_000_000).toFixed(2)}`;
const periodLabel = (s: number) =>
  s === 86400 ? "day" : s === 604800 ? "week" : s === 2592000 ? "month" : `${s / 3600}h`;
const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";

export function PayrollList() {
  const { address } = useWallet();
  const [payrolls, setPayrolls] = useState<Payroll[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);

  async function refresh() {
    if (!address) return;
    const r = await fetch(`/api/payroll/list?wallet=${address}`);
    const d = await r.json();
    setPayrolls(d.payrolls ?? []);
  }

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [address]);

  async function handleApprove(itemId: string) {
    setApproving(itemId);
    try {
      await runApproveEmployee({ itemId });
      await refresh();
    } catch (e: any) {
      console.error("approve failed:", e);
      alert("Approve failed: " + (e?.message ?? e));
    } finally {
      setApproving(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Payroll</h1>
        <a href="/payroll/new" className="rounded-lg bg-[var(--btn)] px-4 py-2 text-sm font-medium text-[var(--btn-text)]">
          + New payroll
        </a>
      </div>

      {!address && <p className="mt-8 text-[var(--muted)]">Connect your wallet to view your payrolls.</p>}
      {address && loading && <p className="mt-8 text-[var(--muted)]">Loading…</p>}
      {address && payrolls && payrolls.length === 0 && (
        <p className="mt-8 text-[var(--muted)]">No payrolls yet. Create your first one.</p>
      )}

      {address && payrolls && payrolls.length > 0 && (
        <>
          {/* Stats */}
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat
              label="Paid out"
              value={usd(
                payrolls.reduce(
                  (sum, p) =>
                    sum +
                    p.payroll_items.reduce(
                      (s, i) =>
                        s +
                        (i.payroll_history ?? [])
                          .filter((h) => h.status === "success")
                          .reduce((hs, h) => hs + h.amount, 0),
                      0
                    ),
                  0
                )
              )}
            />
            <Stat label="Payrolls" value={String(payrolls.length)} />
            <Stat
              label="Employees"
              value={String(payrolls.reduce((n, p) => n + p.payroll_items.length, 0))}
            />
            <Stat
              label="Active"
              value={String(
                payrolls.reduce(
                  (n, p) => n + p.payroll_items.filter((i) => i.status === "active").length,
                  0
                )
              )}
            />
          </div>

          <h2 className="mt-12 text-xl font-semibold tracking-tight">Your payrolls</h2>
          <div className="mt-4 space-y-5">
          {payrolls.slice(0, 2).map((p) => {
            const period = periodLabel(p.period_seconds);
            const total = p.payroll_items.reduce((s, i) => s + i.amount, 0);
            return (
              <div key={p.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-semibold">{p.name}</p>
                    <p className="text-sm text-[var(--muted)]">
                      {p.payroll_items.length} {p.payroll_items.length === 1 ? "employee" : "employees"} · {usd(total)} / {period}
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {p.payroll_items.map((i) => {
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
                          <span className="text-xs text-[var(--accent)]">active ✓</span>
                        ) : (
                          <button
                            onClick={() => handleApprove(i.id)}
                            disabled={approving === i.id}
                            className="rounded-lg bg-[var(--btn)] px-3 py-1.5 text-xs font-medium text-[var(--btn-text)] transition hover:bg-[var(--btn-hover)] disabled:opacity-40"
                          >
                            {approving === i.id ? "Approving…" : "Approve"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          </div>
          {payrolls.length > 2 && (
            <a href="/payroll/all" className="mt-4 inline-block text-sm text-[var(--primary)] hover:underline">
              View all {payrolls.length} payrolls →
            </a>
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