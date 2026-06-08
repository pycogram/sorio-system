"use client";

import { useEffect, useState } from "react";
import { Navbar } from "../navbar";
import { useWallet } from "../providers";
import { runCancel } from "../subscribe/[planPda]/cancel-action";

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
  d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";

export default function SubscriptionsPage() {
  const { address } = useWallet();
  const [subs, setSubs] = useState<MySubscription[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    fetch(`/api/dashboard?wallet=${address}`)
      .then((r) => r.json())
      .then((d) => setSubs(d.mySubscriptions ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [address]);

  async function handleCancel(s: MySubscription) {
    if (!s.plan_pda) return;
    setCancelling(s.id);
    try {
      await runCancel({ planPda: s.plan_pda, subscriptionPda: s.subscription_pda });
      const r = await fetch(`/api/dashboard?wallet=${address}`);
      const d = await r.json();
      setSubs(d.mySubscriptions ?? []);
    } catch (e: any) {
      if (e?.message !== "USER_CANCELLED") console.error("cancel failed", e);
    } finally {
      setCancelling(null);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Navbar />
      <div className="mx-auto max-w-4xl px-8 py-12">
        <a href="/dashboard" className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">← Dashboard</a>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Your subscriptions</h1>

        {!address && <p className="mt-6 text-[var(--muted)]">Connect your wallet to view your subscriptions.</p>}
        {address && loading && <p className="mt-6 text-[var(--muted)]">Loading…</p>}
        {address && subs && subs.length === 0 && (
          <p className="mt-6 text-[var(--muted)]">You have no subscriptions yet.</p>
        )}

        {address && subs && subs.length > 0 && (
          <div className="mt-8 space-y-3">
            {subs.map((s) => {
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
        )}
      </div>
    </main>
  );
}