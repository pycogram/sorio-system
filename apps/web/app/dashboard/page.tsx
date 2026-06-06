"use client";

import { useEffect, useState } from "react";
import { Navbar } from "../navbar";
import { useWallet } from "../providers";

type Subscriber = {
  id: string;
  subscriber_wallet: string;
  status: string;
  next_collection_at: string | null;
  last_collection_at: string | null;
};
type Plan = {
  id: string;
  plan_pda: string;
  name: string;
  amount: number;
  merchant_amount: number | null;
  period_seconds: number;
  active: boolean;
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
  s === 604800 ? "week" : s === 2592000 ? "month" : s === 31536000 ? "year" : `${s / 3600}h`;
const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";

export default function Dashboard() {
  const { address } = useWallet();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showAllPlans, setShowAllPlans] = useState(false);
  const [showAllPayments, setShowAllPayments] = useState(false);

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

  const activeSubs =
    data?.plans.reduce((n, p) => n + p.subscribers.filter((s) => s.status === "active").length, 0) ?? 0;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Navbar />
      <div className="mx-auto max-w-5xl px-8 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>

        {!address && (
          <p className="mt-6 text-[var(--muted)]">Connect your wallet to view your plans and revenue.</p>
        )}
        {address && loading && <p className="mt-6 text-[var(--muted)]">Loading…</p>}
        {address && data && !data.merchant && (
          <p className="mt-6 text-[var(--muted)]">
            No plans found for this wallet yet. <a href="/create" className="underline">Create one →</a>
          </p>
        )}

        {address && data?.merchant && (
          <>
            {/* Stats */}
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Stat label="Your revenue" value={usd(data.totalRevenue)} />
              <Stat label="Active subscribers" value={String(activeSubs)} />
              <Stat label="Plans" value={String(data.plans.length)} />
            </div>

            {/* Plans */}
            <h2 className="mt-12 text-xl font-semibold tracking-tight">Plans</h2>
            <div className="mt-4 space-y-4">
              {(showAllPlans ? data.plans : data.plans.slice(0, 4)).map((p) => {
                const period = periodLabel(p.period_seconds);
                
                const link = `${typeof window !== "undefined" ? window.location.origin : ""}/subscribe/${p.plan_pda}`;
                return (
                  <div key={p.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{p.name}</p>
                        <p className="mt-1 text-sm text-[var(--muted)]">
                          Customer pays {usd(p.amount)} / {period}
                        </p>
                      </div>
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

                    {p.subscribers.length > 0 ? (
                      <div className="mt-4 border-t border-[var(--border)] pt-4">
                        <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                          {p.subscribers.length} subscriber{p.subscribers.length > 1 ? "s" : ""}
                        </p>
                        <div className="mt-2 space-y-1">
                          {p.subscribers.slice(0, 3).map((s) => (
                            <div key={s.id} className="flex items-center justify-between text-sm">
                              <span className="font-mono text-[var(--muted)]">{short(s.subscriber_wallet)}</span>
                              <span className="text-[var(--muted)]">
                                next: {fmtDate(s.next_collection_at)}
                              </span>
                            </div>
                          ))}
                        </div>
                        {p.subscribers.length > 3 && (
                         <a
                            href={`/plans/${p.plan_pda}`}
                            className="mt-2 inline-block text-sm text-[var(--primary)] hover:underline"
                          >
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
              })}
            </div>
            {data.plans.length > 4 && (
              <a href="/plans" className="mt-4 inline-block text-sm text-[var(--primary)] hover:underline">
                View all {data.plans.length} plans →
              </a>
            )}

            {/* Recent payments */}
            <h2 className="mt-12 text-xl font-semibold tracking-tight">Recent payments</h2>
            <div className="mt-4 overflow-hidden rounded-xl border border-[var(--border)]">
              {data.recentPayments.length === 0 && (
                <p className="p-6 text-sm text-[var(--muted)]">No payments yet.</p>
              )}
              {(showAllPayments ? data.recentPayments : data.recentPayments.slice(0, 10)).map((pay, i) => (
                <div
                  key={pay.id}
                  className={`flex items-center justify-between px-6 py-3 text-sm ${
                    i > 0 ? "border-t border-[var(--border)]" : ""
                  }`}
                >
                  <span className="text-[var(--muted)]">{fmtDate(pay.attempted_at)}</span>
                  <span>{usd(pay.amount)}</span>
                  <span
                    className={
                      pay.status === "success" ? "text-green-600" : "text-[var(--muted)]"
                    }
                  >
                    {pay.status}
                  </span>
                  {pay.tx_signature ? (
                    <a
                      href={`https://explorer.solana.com/tx/${pay.tx_signature}?cluster=devnet`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--primary)] hover:underline"
                    >
                      view
                    </a>
                  ) : (
                    <span className="text-[var(--muted)]">—</span>
                  )}
                </div>
              ))}
            </div>
            {data.recentPayments.length > 10 && (
              <button
                onClick={() => setShowAllPayments((v) => !v)}
                className="mt-4 text-sm text-[var(--primary)] hover:underline"
              >
                {showAllPayments ? "Show fewer payments" : "View more payments"}
              </button>
            )}
          </>
        )}
      </div>
    </main>
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