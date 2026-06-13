"use client";
import Link from "next/link";

import { useEffect, useState, use } from "react";
import { Navbar } from "../../navbar";
import { useWallet } from "../../providers";
import { runSubscribe } from "./subscribe-action";

type Plan = {
  plan_pda: string;
  name: string;
  amount: number;
  merchant_amount: number;
  token_mint: string;
  period_seconds: number;
  merchants: { name: string; destination_wallet: string } | null;
};

const periodLabel = (s: number) =>
  s === 3600 ? "hour" : s === 86400 ? "day" : s === 604800 ? "week" : s === 2592000 ? "month" : s === 31536000 ? "year" : `${s / 3600}h`;

export default function SubscribePage({
  params,
}: {
  params: Promise<{ planPda: string }>;
}) {
  const { planPda } = use(params);
  const { address } = useWallet();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [alreadySubscribed, setAlreadySubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [done, setDone] = useState(false);
  const [limitOn, setLimitOn] = useState(false);
  const [times, setTimes] = useState("3");

  useEffect(() => {
    fetch(`/api/plan/${planPda}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.plan) setPlan(d.plan);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [planPda]);

  useEffect(() => {
    if (!address || !plan) return;
    fetch(`/api/subscription-status?planPda=${plan.plan_pda}&wallet=${address}`)
      .then((r) => r.json())
      .then((d) => setAlreadySubscribed(!!d.subscribed))
      .catch(() => {});
  }, [address, plan]);

  const period = plan ? periodLabel(plan.period_seconds) : "";
  const isOwnPlan = !!(
    address &&
    plan?.merchants?.destination_wallet &&
    address === plan.merchants.destination_wallet
  );

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Navbar />
      
      <div className="mx-auto max-w-5xl px-8 py-14 mt-12 md:mt-0">
        <Link href="/dashboard" className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">← Dashboard</Link>
        
        <div className="mx-auto grid max-w-auto grid-cols-1 gap-12 py-4 md:py-6 md:grid-cols-2">
          {/* LEFT — context & trust */}
          <div className="flex flex-col justify-center">
            {loading && <p className="text-[var(--muted)]">Loading…</p>}
            {notFound && <p className="text-[var(--muted)]">Plan not found.</p>}
            {plan && (
              <>
                <p className="text-sm font-medium uppercase tracking-wide text-[var(--muted)]">
                  {plan.merchants?.name ?? "Merchant"}
                </p>
                <h1 className="mt-2 text-4xl font-semibold tracking-tight">
                  {plan.name}
                </h1>
                <p className="mt-4 text-[var(--muted)] leading-relaxed">
                  A recurring subscription paid in USDC on Solana. You approve once,
                  payments are collected automatically each {period}. No card, no bank,
                  cancel anytime.
                </p>

                <div className="mt-8 space-y-4">
                  <Step n="1" title="Approve once">
                    Connect your wallet and authorize the recurring payment. You sign a
                    single time.
                  </Step>
                  <Step n="2" title={`Auto-renews each ${period}`}>
                    ${(plan.amount / 1_000_000).toFixed(2)} is collected every {period},
                    automatically.
                  </Step>
                  <Step n="3" title="Cancel anytime">
                    Revoke the authorization whenever you want. You stay in control.
                  </Step>
                </div>
              </>
            )}
          </div>

          {/* RIGHT — checkout card */}
          {plan && (
            <div className="flex items-center">
              <div className="w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-sm">
                <p className="text-sm text-[var(--muted)]">{plan.name}</p>
                <p className="mt-2 text-5xl font-semibold tracking-tight">
                  ${(plan.amount / 1_000_000).toFixed(2)}
                  <span className="text-lg font-normal text-[var(--muted)]">
                    {" "}/ {period}
                  </span>
                </p>

                <div className="my-6 h-px bg-[var(--border)]" />

                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--muted)]">Subscription</span>
                  <span className="font-medium">
                    ${(plan.merchant_amount / 1_000_000).toFixed(2)}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-[var(--muted)]">Service fee</span>
                  <span className="font-medium">
                    ${((plan.amount - plan.merchant_amount) / 1_000_000).toFixed(2)}
                  </span>
                </div>
                <div className="my-3 h-px bg-[var(--border)]" />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--muted)]">Total per {period}</span>
                  <span className="font-semibold">
                    ${(plan.amount / 1_000_000).toFixed(2)}
                  </span>
                </div>

                <button
                  disabled={!address || alreadySubscribed || subscribing || done || isOwnPlan}
                  onClick={async () => {
                    if (!plan || !address) return;
                    setSubscribing(true);
                    try {
                      const r = await runSubscribe({
                        planPda: plan.plan_pda,
                        merchantWallet: plan.merchants?.destination_wallet ?? "",
                        maxPayments: limitOn ? parseInt(times) || null : null,
                      });
                      console.log("subscribed:", r);
                      setDone(true);
                    } catch (e: any) {
                      console.error("subscribe failed:", e);
                      alert("Failed: " + (e?.message ?? e));
                    } finally {
                      setSubscribing(false);
                    }
                  }}
                  className="mt-7 w-full rounded-lg bg-[var(--btn)] px-4 py-3 font-medium text-[var(--btn-text)] transition hover:bg-[var(--btn-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {done
                    ? "Subscribed ✓"
                    : isOwnPlan
                    ? "This is your plan"
                    : alreadySubscribed
                    ? "Already subscribed ✓"
                    : subscribing
                    ? "Confirming…"
                    : address
                    ? "Subscribe"
                    : "Connect wallet to subscribe"}
                </button>

                <div className="mt-6 rounded-lg border border-[var(--border)] p-4">
                  <label className="flex items-center justify-between">
                    <span className="text-sm font-medium">Limit number of payments</span>
                    <input
                      type="checkbox"
                      checked={limitOn}
                      onChange={(e) => setLimitOn(e.target.checked)}
                      className="h-4 w-4 accent-[var(--primary)]"
                    />
                  </label>
                  {!limitOn ? (
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      Renews forever until you cancel.
                    </p>
                  ) : (
                    <div className="mt-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-[var(--muted)]">Stop after</span>
                        <input
                          type="number"
                          min={1}
                          value={times}
                          onChange={(e) => setTimes(e.target.value)}
                          className="w-20 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm outline-none focus:border-[var(--primary)]"
                        />
                        <span className="text-sm text-[var(--muted)]">payments</span>
                      </div>
                      {parseInt(times) > 0 && (
                        <p className="mt-2 text-xs text-[var(--muted)]">
                          ${(plan.amount / 1_000_000).toFixed(2)} × {parseInt(times)} ={" "}
                          ${((plan.amount * parseInt(times)) / 1_000_000).toFixed(2)} total, then auto-stops.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {isOwnPlan && (
                  <p className="mt-3 text-center text-sm text-[var(--muted)]">
                    You can&apos;t subscribe to your own plan.
                  </p>
                )}
                {done && (
                  <p className="mt-3 text-center text-sm text-[var(--accent)]">
                    You're all set. Payments will renew automatically.
                  </p>
                )}
                <p className="mt-3 text-center text-xs text-[var(--muted)]">
                  Secured on Solana · cancel anytime
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[var(--primary)] text-xs font-semibold text-white">
        {n}
      </div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-[var(--muted)]">{children}</p>
      </div>
    </div>
  );
}