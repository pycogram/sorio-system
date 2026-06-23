"use client";

import { useState } from "react";
import { Navbar } from "../navbar";
import { useWallet } from "../providers";
import { signRequest } from "../lib/sign-request";

type Metrics = {
  subscriptions: Record<string, number>;
  payroll: { items: Record<string, number>; payrolls: number };
  transactions: {
    subscription: { success: number; failed: number };
    payroll: { success: number; failed: number };
  };
  money: { feeWalletUsdc: string | null; collectorSol: string | null };
  volume: { totalBaseUnits: number; note?: string };
  health: { successRatePct: number | null; totalSuccess: number; totalFailed: number };
  recurring: { monthlyBaseUnits: number };
};

type SubRow = {
  id: string;
  subscriber_wallet: string;
  status: string;
  next_collection_at: string | null;
  plans: { name: string; amount: number; merchant_amount: number; period_seconds: number } | null;
  lastStatus: string | null;
  lastFailure: string | null;
};

type ItemRow = {
  id: string;
  employee_wallet: string;
  amount: number;
  status: string;
  next_payment_at: string | null;
  payrolls: { name: string; employer_wallet: string } | null;
  lastStatus: string | null;
  lastFailure: string | null;
};

const usd = (baseUnits: number) =>
  `$${(baseUnits / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const shortWallet = (w: string) => (w ? `${w.slice(0, 4)}…${w.slice(-4)}` : "-");

export default function AdminPage() {
  const { address } = useWallet();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setErr(null);
    try {
      // Metrics
      const mAuth = await signRequest("admin-metrics", {});
      const mQs = new URLSearchParams({ wallet: mAuth.wallet, timestamp: String(mAuth.timestamp), signature: mAuth.signature });
      const mRes = await fetch(`/api/admin/metrics?${mQs}`);
      const mData = await mRes.json();
      if (!mRes.ok) throw new Error(mData.error ?? "metrics failed");
      setMetrics(mData);

      // List
      const lAuth = await signRequest("admin-list", {});
      const lQs = new URLSearchParams({ wallet: lAuth.wallet, timestamp: String(lAuth.timestamp), signature: lAuth.signature });
      const lRes = await fetch(`/api/admin/list?${lQs}`);
      const lData = await lRes.json();
      if (!lRes.ok) throw new Error(lData.error ?? "list failed");
      setSubs(lData.subscriptions ?? []);
      setItems(lData.payrollItems ?? []);
    } catch (e: any) {
      if (e?.message === "USER_CANCELLED") { setLoading(false); return; }
      setErr(e?.message ?? "failed");
    } finally {
      setLoading(false);
    }
  }

  async function subAction(id: string, action: "pause" | "resume" | "cancel") {
    if (action === "cancel" && !confirm("Cancel this subscription? This stops all future collections.")) return;
    setBusyId(id);
    try {
      const auth = await signRequest("admin-subscription", { id, op: action });
      const r = await fetch("/api/admin/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, ...auth }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "failed");
      await loadAll();
    } catch (e: any) {
      if (e?.message !== "USER_CANCELLED") alert("Action failed: " + (e?.message ?? e));
    } finally {
      setBusyId(null);
    }
  }

  async function itemAction(id: string, action: "pause" | "resume") {
    setBusyId(id);
    try {
      const auth = await signRequest("admin-payroll-item", { id, op: action });
      const r = await fetch("/api/admin/payroll-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, ...auth }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "failed");
      await loadAll();
    } catch (e: any) {
      if (e?.message !== "USER_CANCELLED") alert("Action failed: " + (e?.message ?? e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Navbar />
      <div className="mx-auto max-w-5xl px-8 py-14 mt-12 md:mt-0">
        <h1 className="text-3xl font-semibold tracking-tight">Admin</h1>
        <p className="mt-2 text-[var(--muted)] text-sm">
          Wallet-gated. Sign with the admin wallet to load and manage records.
        </p>

        <button
          onClick={loadAll}
          disabled={!address || loading}
          className="mt-6 rounded-lg bg-[var(--btn)] px-4 py-2.5 text-sm font-medium text-[var(--btn-text)] transition hover:bg-[var(--btn-hover)] disabled:opacity-40"
        >
          {loading ? "Loading…" : address ? "Load dashboard" : "Connect admin wallet"}
        </button>

        {err && <p className="mt-4 text-sm text-red-500">Error: {err}</p>}

        {metrics && (
          <div className="mt-10 space-y-10">
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Overview</h2>
              <div className="mt-3 grid grid-cols-3 gap-4">
                <Card label="Total volume (approx)" value={usd(metrics.volume.totalBaseUnits)} />
                <Card label="Success rate" value={metrics.health.successRatePct != null ? `${metrics.health.successRatePct}%` : "-"} />
                <Card label="Recurring revenue / mo" value={usd(metrics.recurring.monthlyBaseUnits)} />
              </div>
            </section>

            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Money</h2>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <Card label="Revenue - fee wallet USDC (current)" value={metrics.money.feeWalletUsdc ?? "-"} />
                <Card label="Collector SOL (remaining / runway)" value={metrics.money.collectorSol ?? "-"} />
              </div>
            </section>

            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Subscriptions</h2>
              <div className="mt-3 grid grid-cols-4 gap-4">
                <Card label="Active" value={metrics.subscriptions.active} />
                <Card label="Paused" value={metrics.subscriptions.paused} />
                <Card label="Cancelled" value={metrics.subscriptions.cancelled} />
                <Card label="Completed" value={metrics.subscriptions.completed} />
              </div>
            </section>

            {/* ACTIONABLE: subscriptions */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
                Manage subscriptions ({subs.length})
              </h2>
              <div className="mt-3 overflow-hidden rounded-xl border border-[var(--border)]">
                {subs.length === 0 ? (
                  <p className="p-4 text-sm text-[var(--muted)]">No active or paused subscriptions.</p>
                ) : (
                  subs.map((s) => (
                    <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4 last:border-b-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {s.plans?.name ?? "Plan"} · <span className="text-[var(--muted)]">{shortWallet(s.subscriber_wallet)}</span>
                        </p>
                        <p className="text-xs text-[var(--muted)]">
                          <StatusBadge status={s.status} />
                          {s.plans ? ` · ${usd(s.plans.merchant_amount ?? s.plans.amount)} / cycle` : ""}
                          {s.lastFailure ? ` · last fail: ${s.lastFailure.slice(0, 60)}` : ""}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {s.status === "active" && (
                          <Btn onClick={() => subAction(s.id, "pause")} busy={busyId === s.id}>Pause</Btn>
                        )}
                        {s.status === "paused" && (
                          <Btn onClick={() => subAction(s.id, "resume")} busy={busyId === s.id}>Resume</Btn>
                        )}
                        <Btn danger onClick={() => subAction(s.id, "cancel")} busy={busyId === s.id}>Cancel</Btn>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* ACTIONABLE: payroll items */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
                Manage payroll items ({items.length})
              </h2>
              <div className="mt-3 overflow-hidden rounded-xl border border-[var(--border)]">
                {items.length === 0 ? (
                  <p className="p-4 text-sm text-[var(--muted)]">No active or paused payroll items.</p>
                ) : (
                  items.map((i) => (
                    <div key={i.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4 last:border-b-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {i.payrolls?.name ?? "Payroll"} · <span className="text-[var(--muted)]">{shortWallet(i.employee_wallet)}</span>
                        </p>
                        <p className="text-xs text-[var(--muted)]">
                          <StatusBadge status={i.status} />
                          {` · ${usd(Number(i.amount))} / cycle`}
                          {i.lastFailure ? ` · last fail: ${i.lastFailure.slice(0, 60)}` : ""}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {i.status === "active" && (
                          <Btn onClick={() => itemAction(i.id, "pause")} busy={busyId === i.id}>Pause</Btn>
                        )}
                        {i.status === "paused" && (
                          <Btn onClick={() => itemAction(i.id, "resume")} busy={busyId === i.id}>Resume</Btn>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <p className="text-xs text-[var(--muted)]">
              Revenue is current USDC in the fee wallet (drops if withdrawn). Volume and recurring
              revenue are approximate from records. Success rate is attempt-level.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "active" ? "text-[var(--accent)]" :
    status === "paused" ? "text-yellow-500" :
    "text-[var(--muted)]";
  return <span className={`font-medium ${color}`}>{status}</span>;
}

function Btn({ children, onClick, busy, danger }: { children: React.ReactNode; onClick: () => void; busy?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-40 ${
        danger
          ? "border border-red-500/40 text-red-500 hover:bg-red-500/10"
          : "border border-[var(--border)] hover:bg-[var(--card)]"
      }`}
    >
      {busy ? "…" : children}
    </button>
  );
}