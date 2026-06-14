"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { useWallet } from "../providers";
import { fetcher } from "../lib/fetcher";
import { signRequest } from "../lib/sign-request";

type Subscriber = {
  id: string;
  subscriber_wallet: string;
  status: string;
  next_collection_at: string | null;
  last_collection_at: string | null;
  max_payments: number | null;
  payments_made: number;
  received: number;
};
type Plan = {
  id: string;
  plan_pda: string;
  name: string;
  amount: number;
  merchant_amount: number | null;
  period_seconds: number;
  active: boolean;
  hidden: boolean;
  subscribers: Subscriber[];
};
type Payment = {
  id: string;
  subscription_id: string;
  amount: number;
  status: string;
  tx_signature: string | null;
  attempted_at: string;
};
type Data = {
  merchant: { id: string; name: string } | null;
  plans: Plan[];
  totalRevenue: number;
  recentPayments: Payment[];
};

const usd = (n: number) => `$${(n / 1_000_000).toFixed(2)}`;
const periodLabel = (s: number) =>
  s === 3600 ? "hour" : s === 86400 ? "day" : s === 604800 ? "week" : s === 2592000 ? "month" : s === 31536000 ? "year" : `${s / 3600}h`;
const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";

export function PlansOwned() {
  const { address } = useWallet();
  const { mutate } = useSWRConfig();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [visible, setVisible] = useState(5);
  const [showHidden, setShowHidden] = useState(false);
  const [busyPda, setBusyPda] = useState<string | null>(null);

  const cacheKey = address ? `/api/dashboard?wallet=${address}` : null;
  const { data, isLoading: loading } = useSWR<Data>(cacheKey, fetcher);

  const activeSubs =
    data?.plans.reduce((n, p) => n + p.subscribers.filter((s) => s.status === "active").length, 0) ?? 0;

  const visiblePlans = data?.plans.filter((p) => !p.hidden) ?? [];
  const hiddenPlans = data?.plans.filter((p) => p.hidden) ?? [];
  const shownPlans = showHidden ? [...visiblePlans, ...hiddenPlans] : visiblePlans;

  async function toggleHidden(p: Plan) {
    if (!address) return;
    setBusyPda(p.plan_pda);
    try {
      const auth = await signRequest("plan-hide", { planPda: p.plan_pda, hidden: !p.hidden });
      const res = await fetch(`/api/plan/${p.plan_pda}/hide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...auth, hidden: !p.hidden }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed to update plan");
      }
      if (cacheKey) await mutate(cacheKey);
    } catch (e: any) {
      if (e?.message === "USER_CANCELLED") return;
      alert(e?.message ?? "Could not update plan visibility.");
    } finally {
      setBusyPda(null);
    }
  }

  const renderPlanCard = (p: Plan) => {
    const period = periodLabel(p.period_seconds);
    const link = `${typeof window !== "undefined" ? window.location.origin : ""}/subscribe/${p.plan_pda}`;
    const busy = busyPda === p.plan_pda;
    return (
      <div
        key={p.id}
        className={`rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 ${p.hidden ? "opacity-60" : ""}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium">{p.name}</p>
              {p.hidden && (
                <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                  Hidden
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Customer pays {usd(p.amount)} / {period}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => toggleHidden(p)}
              disabled={busy}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs transition hover:border-[var(--primary)] disabled:opacity-50"
            >
              {busy ? "…" : p.hidden ? "Unhide" : "Hide"}
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(link);
                setCopiedId(p.id);
                setTimeout(() => setCopiedId((c) => (c === p.id ? null : c)), 1500);
              }}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs transition hover:border-[var(--primary)]"
            >
              {copiedId === p.id ? "Copied!" : "Copy link"}
            </button>
          </div>
        </div>

        {p.subscribers.length > 0 ? (
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
              {p.subscribers.length} subscriber{p.subscribers.length > 1 ? "s" : ""}
            </p>
            <div className="mt-2 space-y-1">
              {p.subscribers.slice(0, 3).map((s) => (
                <div key={s.id} className="flex items-center justify-between text-sm">
                  <div className="flex flex-col">
                    <span className="font-mono text-[var(--muted)]">{short(s.subscriber_wallet)}</span>
                    <span className="mt-0.5 text-xs text-[var(--muted)]">
                      {usd(s.received)} received
                      {s.max_payments != null && (
                        <> · {s.payments_made} of {s.max_payments}
                          {s.payments_made >= s.max_payments ? " · complete" : ` · ${s.max_payments - s.payments_made} left`}
                        </>
                      )}
                    </span>
                  </div>
                  <span className="text-[var(--muted)]">next: {fmtDate(s.next_collection_at)}</span>
                </div>
              ))}
            </div>
            {p.subscribers.length > 3 && (
              <a href={`/plans/${p.plan_pda}`} className="mt-2 inline-block text-sm text-[var(--primary)] hover:underline">
                View all {p.subscribers.length} subscribers →
              </a>
            )}
          </div>
        ) : (
          <p className="mt-4 border-t border-[var(--border)] pt-4 text-sm text-[var(--muted)]">
            No subscribers yet.
          </p>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Plans</h1>
        <a
          href="/create"
          className="rounded-lg bg-[var(--btn)] px-4 py-2 text-sm font-medium text-[var(--btn-text)] transition hover:bg-[var(--btn-hover)]"
        >
          + Create plan
        </a>
      </div>
      <p className="mt-1 text-sm text-[var(--muted)]">Plans paying into your wallet.</p>

      {!address && <p className="mt-8 text-[var(--muted)]">Connect your wallet to view your plans and revenue.</p>}
      {address && loading && <p className="mt-8 text-[var(--muted)]">Loading…</p>}
      {address && data && !data.merchant && (
        <p className="mt-8 text-[var(--muted)]">No plans yet. Create your first one to start accepting recurring payments.</p>
      )}

      {address && data && data.merchant && (
        <>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat label="Your revenue" value={usd(data.totalRevenue)} />
            <Stat label="Active subscribers" value={String(activeSubs)} />
            <Stat label="Plans" value={String(visiblePlans.length)} />
          </div>

          {visiblePlans.length === 0 && !showHidden && hiddenPlans.length > 0 && (
            <p className="mt-8 text-sm text-[var(--muted)]">
              All your plans are hidden. Use “Show hidden plans” below to bring them back.
            </p>
          )}

          <div className="mt-8 space-y-4">
            {shownPlans.slice(0, visible).map(renderPlanCard)}
          </div>

          {visible < shownPlans.length && (
            <button
              onClick={() => setVisible((v) => v + 10)}
              className="mt-4 text-sm text-[var(--primary)] hover:underline"
            >
              View more ({shownPlans.length - visible} left)
            </button>
          )}

          {hiddenPlans.length > 0 && (
            <button
              onClick={() => {
                setShowHidden((v) => !v);
                setVisible(5);
              }}
              className="mt-6 block text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]"
            >
              {showHidden ? "Hide hidden plans" : `Show hidden plans (${hiddenPlans.length})`}
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