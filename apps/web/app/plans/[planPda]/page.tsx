"use client";

import { useEffect, useState, use } from "react";
import { Navbar } from "../../navbar";
import { useWallet } from "../../providers";

type Subscriber = {
  id: string;
  subscriber_wallet: string;
  status: string;
  next_collection_at: string | null;
  last_collection_at: string | null;
};
type Plan = {
  plan_pda: string;
  name: string;
  amount: number;
  merchant_amount: number | null;
  period_seconds: number;
  subscribers: Subscriber[];
};

const usd = (n: number) => `$${(n / 1_000_000).toFixed(2)}`;
const periodLabel = (s: number) =>
  s === 604800 ? "week" : s === 2592000 ? "month" : s === 31536000 ? "year" : `${s / 3600}h`;
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "never";

export default function PlanDetail({ params }: { params: Promise<{ planPda: string }> }) {
  const { planPda } = use(params);
  const { address } = useWallet();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    fetch(`/api/dashboard?wallet=${address}`)
      .then((r) => r.json())
      .then((d) => {
        const found = (d.plans ?? []).find((p: Plan) => p.plan_pda === planPda) ?? null;
        setPlan(found);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [address, planPda]);

  const period = plan ? periodLabel(plan.period_seconds) : "";
  const activeCount = plan?.subscribers.filter((s) => s.status === "active").length ?? 0;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Navbar />
      <div className="mx-auto max-w-4xl px-8 py-12">
        <a href="/plans" className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">← All plans</a>

        {!address && <p className="mt-6 text-[var(--muted)]">Connect your wallet to view this plan.</p>}
        {address && loading && <p className="mt-6 text-[var(--muted)]">Loading…</p>}
        {address && !loading && !plan && (
          <p className="mt-6 text-[var(--muted)]">Plan not found for this wallet.</p>
        )}

        {plan && (
          <>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">{plan.name}</h1>
            <p className="mt-1 text-[var(--muted)]">
              Customer pays {usd(plan.amount)} / {period} · {activeCount} active subscriber{activeCount === 1 ? "" : "s"}
            </p>

            <h2 className="mt-10 text-xl font-semibold tracking-tight">Subscribers</h2>
            {plan.subscribers.length === 0 ? (
              <p className="mt-4 text-[var(--muted)]">No subscribers yet.</p>
            ) : (
              <div className="mt-4 overflow-hidden rounded-xl border border-[var(--border)]">
                {plan.subscribers.map((s, i) => (
                  <div
                    key={s.id}
                    className={`flex items-center justify-between px-6 py-4 text-sm ${
                      i > 0 ? "border-t border-[var(--border)]" : ""
                    }`}
                  >
                    <span className="font-mono">{s.subscriber_wallet}</span>
                    <div className="flex items-center gap-6">
                      <span className="text-[var(--muted)]">
                        last: {fmtDate(s.last_collection_at)}
                      </span>
                      <span className="text-[var(--muted)]">
                        next: {fmtDate(s.next_collection_at)}
                      </span>
                      <span
                        className={
                          s.status === "active" ? "text-green-600" : "text-[var(--muted)]"
                        }
                      >
                        {s.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}