"use client";

import { useEffect, useState } from "react";
import { Navbar } from "../navbar";
import { useWallet } from "../providers";

type Subscriber = { id: string; status: string };
type Plan = {
  id: string;
  plan_pda: string;
  name: string;
  amount: number;
  merchant_amount: number | null;
  period_seconds: number;
  subscribers: Subscriber[];
};
type Data = { merchant: { name: string } | null; plans: Plan[] };

const usd = (n: number) => `$${(n / 1_000_000).toFixed(2)}`;
const periodLabel = (s: number) =>
  s === 604800 ? "week" : s === 2592000 ? "month" : s === 31536000 ? "year" : `${s / 3600}h`;

export default function PlansPage() {
  const { address } = useWallet();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setData(null);
      return;
    }
    setLoading(true);
    fetch(`/api/dashboard?wallet=${address}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [address]);

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Navbar />
      <div className="mx-auto max-w-5xl px-8 py-12">
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">← Dashboard</a>
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">All plans</h1>

        {!address && <p className="mt-6 text-[var(--muted)]">Connect your wallet to view your plans.</p>}
        {address && loading && <p className="mt-6 text-[var(--muted)]">Loading…</p>}
        {address && data && !data.merchant && (
          <p className="mt-6 text-[var(--muted)]">No plans found for this wallet.</p>
        )}

        {address && data?.merchant && (
          <div className="mt-8 space-y-4">
            {data.plans.map((p) => {
              const period = periodLabel(p.period_seconds);
              const activeCount = p.subscribers.filter((s) => s.status === "active").length;
              const link = `${typeof window !== "undefined" ? window.location.origin : ""}/subscribe/${p.plan_pda}`;
              return (
                <div key={p.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{p.name}</p>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        Customer pays {usd(p.amount)} / {period} · {activeCount} active subscriber{activeCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
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
                     <a 
                        href={`/plans/${p.plan_pda}`}
                        className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs transition hover:border-[var(--primary)]"
                      >
                        View
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}