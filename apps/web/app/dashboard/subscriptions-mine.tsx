"use client";

import { useState } from "react";
import useSWR from "swr";
import { useWallet } from "../providers";
import { runCancel } from "../subscribe/[planPda]/cancel-action";
import { fetcher } from "../lib/fetcher";

type MySubscription = {
  id: string;
  subscription_pda: string;
  status: string;
  next_collection_at: string | null;
  plan_pda: string | null;
  plan_name: string;
  amount: number;
  period_seconds: number;
  merchant_name: string;
};

const usd = (n: number) => `$${(n / 1_000_000).toFixed(2)}`;
const periodLabel = (s: number) =>
  s === 604800 ? "week" : s === 2592000 ? "month" : s === 31536000 ? "year" : `${s / 3600}h`;
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";

export function SubscriptionsMine() {
  const { address } = useWallet();
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const [visible, setVisible] = useState(5);

  const { data, isLoading: loading, mutate } = useSWR(
    address ? `/api/dashboard?wallet=${address}` : null,
    fetcher
  );
  const subs: MySubscription[] | null = data ? data.mySubscriptions ?? [] : null;

  async function handleCancel(s: MySubscription) {
    if (!s.plan_pda) return;
    setCancelling(s.id);
    try {
      await runCancel({ planPda: s.plan_pda, subscriptionPda: s.subscription_pda });
      await mutate();
    } catch (e: any) {
      if (e?.message !== "USER_CANCELLED") console.error("cancel failed", e);
    } finally {
      setCancelling(null);
    }
  }

  const cancelledCount = subs?.filter((s) => s.status === "cancelled").length ?? 0;
  const activeCount = subs?.filter((s) => s.status === "active").length ?? 0;
  const monthlyOut =
    subs?.filter((s) => s.status === "active").reduce((sum, s) => sum + s.amount, 0) ?? 0;
  const visibleSubs = (subs ?? []).filter((s) => (showCancelled ? true : s.status !== "cancelled"));

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Subscriptions</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">Plans paying out from your wallet.</p>

      {!address && <p className="mt-8 text-[var(--muted)]">Connect your wallet to view your subscriptions.</p>}
      {address && loading && <p className="mt-8 text-[var(--muted)]">Loading…</p>}
      {address && subs && subs.length === 0 && (
        <p className="mt-8 text-[var(--muted)]">You have no subscriptions yet.</p>
      )}

      {address && subs && subs.length > 0 && (
        <>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Stat label="Subscriptions" value={String(subs.filter((s) => s.status !== "cancelled").length)} />
            <Stat label="Active" value={String(activeCount)} />
            <Stat label="Per period" value={usd(monthlyOut)} />
          </div>

          {cancelledCount > 0 && (
            <button
              onClick={() => setShowCancelled((v) => !v)}
              className="mt-8 text-sm text-[var(--primary)] hover:underline"
            >
              {showCancelled ? "Hide cancelled" : `Show cancelled (${cancelledCount})`}
            </button>
          )}

          <div className="mt-4 space-y-3">
            {visibleSubs.length === 0 && (
              <p className="text-[var(--muted)]">No active subscriptions.</p>
            )}
            {visibleSubs.slice(0, visible).map((s) => {
              const period = periodLabel(s.period_seconds);
              return (
                <div key={s.id} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
                  <div>
                    <p className="font-medium">{s.plan_name}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {usd(s.amount)} / {period} ·{" "}
                      {s.status === "active" ? `next ${fmtDate(s.next_collection_at)}` : s.status}
                    </p>
                  </div>
                  {s.status === "active" ? (
                    <button
                      onClick={() => handleCancel(s)}
                      disabled={cancelling === s.id}
                      className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs transition hover:border-red-400 hover:text-red-500 disabled:opacity-50"
                    >
                      {cancelling === s.id ? "Cancelling…" : "Cancel"}
                    </button>
                  ) : (
                    <span className="text-xs text-[var(--muted)] capitalize">{s.status}</span>
                  )}
                </div>
              );
            })}
          </div>
          {visible < visibleSubs.length && (
            <button
              onClick={() => setVisible((v) => v + 10)}
              className="mt-4 text-sm text-[var(--primary)] hover:underline"
            >
              View more ({visibleSubs.length - visible} left)
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
