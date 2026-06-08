"use client";

import { useEffect, useState } from "react";
import { useWallet } from "../providers";
import { runCancel } from "../subscribe/[planPda]/cancel-action";

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
type Data = {
  merchant: { id: string; name: string } | null;
  plans: Plan[];
  totalRevenue: number;
  recentPayments: Payment[];
  mySubscriptions: MySubscription[];
};

const usd = (n: number) => `$${(n / 1_000_000).toFixed(2)}`;
const periodLabel = (s: number) =>
  s === 604800 ? "week" : s === 2592000 ? "month" : s === 31536000 ? "year" : `${s / 3600}h`;
const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";

export function SubscriptionsList() {
  const { address } = useWallet();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

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

  async function handleCancel(s: MySubscription) {
    if (!s.plan_pda) return;
    setCancelling(s.id);
    try {
      await runCancel({ planPda: s.plan_pda, subscriptionPda: s.subscription_pda });
      const r = await fetch(`/api/dashboard?wallet=${address}`);
      setData(await r.json());
    } catch (e: any) {
      if (e?.message !== "USER_CANCELLED") console.error("cancel failed", e);
    } finally {
      setCancelling(null);
    }
  }

  const activeSubs =
    data?.plans.reduce((n, p) => n + p.subscribers.filter((s) => s.status === "active").length, 0) ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Subscriptions</h1>
        <a
          href="/create"
          className="rounded-lg bg-[var(--btn)] px-4 py-2 text-sm font-medium text-[var(--btn-text)] transition hover:bg-[var(--btn-hover)]"
        >
          + Create plan
        </a>
      </div>

      {!address && (
        <p className="mt-6 text-[var(--muted)]">Connect your wallet to view your plans and revenue.</p>
      )}
      {address && loading && <p className="mt-6 text-[var(--muted)]">Loading…</p>}
      {address && data && !data.merchant && data.mySubscriptions.length === 0 && (
        <>
          <p className="mt-6 text-[var(--muted)]">Nothing here yet.</p>
          <p className="mt-1 text-[var(--muted)]">
            Create a plan to start accepting recurring payments, or open a subscribe
            link from a merchant to subscribe to theirs.
          </p>
        </>
      )}

      {address && data && (data.merchant || data.mySubscriptions.length > 0) && (
        <>
          {/* Merchant: stats */}
          {data.merchant && (
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Stat label="Your revenue" value={usd(data.totalRevenue)} />
              <Stat label="Active subscribers" value={String(activeSubs)} />
              <Stat label="Plans" value={String(data.plans.length)} />
            </div>
          )}

          {/* 1. PLANS (merchant) */}
          {data.merchant && (
            <>
              <h2 className="mt-12 text-xl font-semibold tracking-tight">Plans</h2>
              <div className="mt-4 space-y-4">
                {data.plans.slice(0, 2).map((p) => {
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
                })}
              </div>
              {data.plans.length > 2 && (
                <a href="/plans" className="mt-4 inline-block text-sm text-[var(--primary)] hover:underline">
                  View all {data.plans.length} plans →
                </a>
              )}
            </>
          )}

          {/* 2. SUBSCRIPTIONS (customer) */}
          {data.mySubscriptions.length > 0 && (
            <>
              <h2 className="mt-12 text-xl font-semibold tracking-tight">Your subscriptions</h2>
              <div className="mt-4 space-y-3">
                {data.mySubscriptions.slice(0, 2).map((s) => {
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
              {data.mySubscriptions.length > 2 && (
                <a href="/subscriptions" className="mt-4 inline-block text-sm text-[var(--primary)] hover:underline">
                  View all {data.mySubscriptions.length} subscriptions →
                </a>
              )}
            </>
          )}

          {/* 3. PAYMENTS (merchant) */}
          {data.merchant && (
            <>
              <h2 className="mt-12 text-xl font-semibold tracking-tight">Recent payments</h2>
              <div className="mt-4 overflow-hidden rounded-xl border border-[var(--border)]">
                {data.recentPayments.length === 0 && (
                  <p className="p-6 text-sm text-[var(--muted)]">No payments yet.</p>
                )}
                {data.recentPayments.slice(0, 5).map((pay, i) => (
                  <div
                    key={pay.id}
                    className={`flex items-center justify-between px-6 py-3 text-sm ${i > 0 ? "border-t border-[var(--border)]" : ""}`}
                  >
                    <span className="w-28 text-[var(--muted)]">{fmtDate(pay.attempted_at)}</span>
                    <span className="w-20 text-right">{usd(pay.amount)}</span>
                    <span className={`w-20 text-center ${pay.status === "success" ? "text-green-600" : "text-[var(--muted)]"}`}>
                      {pay.status}
                    </span>
                    {pay.tx_signature ? (
                      <a
                        href={`https://explorer.solana.com/tx/${pay.tx_signature}?cluster=devnet`}
                        target="_blank"
                        rel="noreferrer"
                        className="w-12 text-right text-[var(--primary)] hover:underline"
                      >
                        view
                      </a>
                    ) : (
                      <span className="w-12 text-right text-[var(--muted)]">—</span>
                    )}
                  </div>
                ))}
              </div>
              {data.recentPayments.length > 5 && (
                <a href="/payments" className="mt-4 inline-block text-sm text-[var(--primary)] hover:underline">
                  View all payments →
                </a>
              )}
            </>
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