"use client";
import Link from "next/link";

import { useEffect, useState, use } from "react";
import { useSearchParams } from "next/navigation";
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

// Format a USD amount; show extra precision for tiny (sub-cent) fees so they
// don't round away to $0.00.
function usd(n: number): string {
  if (n <= 0) return "$0.00";
  // Show 4 decimals whenever rounding to cents would hide a sub-cent amount,
  // so a discounted total like $1.005 doesn't collapse to $1.00.
  const rounded2 = Math.round(n * 100) / 100;
  if (Math.abs(n - rounded2) >= 0.00001) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export default function SubscribePage({
  params,
}: {
  params: Promise<{ planPda: string }>;
}) {
  const { planPda } = use(params);
  const { address } = useWallet();
  const searchParams = useSearchParams();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [alreadySubscribed, setAlreadySubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [done, setDone] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [limitOn, setLimitOn] = useState(false);
  const [times, setTimes] = useState("3");
  const [isHolder, setIsHolder] = useState(false);

  // Validate redirect_uri: only http/https allowed. The customer will be sent
  // here after subscribing, with subscription + plan + status appended.
  const rawRedirect = searchParams.get("redirect_uri");
  const redirectUri = (() => {
    if (!rawRedirect) return null;
    try {
      const u = new URL(rawRedirect);
      if (u.protocol !== "https:" && u.protocol !== "http:") return null;
      return rawRedirect;
    } catch {
      return null;
    }
  })();
  const redirectHost = redirectUri ? new URL(redirectUri).hostname : null;

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

  // Check whether the connected wallet is a $SORIO holder, so we can show the
  // fee they'll actually be charged (0.5% for holders vs 2% otherwise).
  useEffect(() => {
    if (!address) {
      setIsHolder(false);
      return;
    }
    fetch(`/api/sorio-balance?wallet=${address}`)
      .then((r) => r.json())
      .then((d) => setIsHolder(!!d.isHolder))
      .catch(() => setIsHolder(false));
  }, [address]);

  const period = plan ? periodLabel(plan.period_seconds) : "";
  const isOwnPlan = !!(
    address &&
    plan?.merchants?.destination_wallet &&
    address === plan.merchants.destination_wallet
  );

  // Fee shown depends on whether the connected wallet is a $SORIO holder.
  // Non-holder: the baked-in fee (amount - merchant_amount), i.e. 2%.
  // Holder: 0.5% of the merchant amount (what the puller will actually charge).
  const merchantUsd = plan ? plan.merchant_amount / 1_000_000 : 0;
  const standardFeeUsd = plan ? (plan.amount - plan.merchant_amount) / 1_000_000 : 0;
  const holderFeeUsd = plan ? (plan.merchant_amount * 0.005) / 1_000_000 : 0;
  const effectiveFeeUsd = isHolder ? holderFeeUsd : standardFeeUsd;
  const effectiveTotalUsd = merchantUsd + effectiveFeeUsd;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Navbar />

      <div className="mx-auto max-w-5xl px-8 py-14 mt-12 md:mt-0">
        <Link href="/dashboard" className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">← Dashboard</Link>

        <div className="mx-auto grid max-w-auto grid-cols-1 gap-12 py-4 md:py-6 md:grid-cols-2">
          {/* LEFT - context & trust */}
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
                    {usd(plan.amount / 1_000_000)} is collected every {period},
                    automatically.
                  </Step>
                  <Step n="3" title="Cancel anytime">
                    Revoke the authorization whenever you want. You stay in control.
                  </Step>
                </div>
              </>
            )}
          </div>

          {/* RIGHT - checkout card */}
          {plan && (
            <div className="flex items-center">
              <div className="w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-sm">
                <p className="text-sm text-[var(--muted)]">{plan.name}</p>
                <p className="mt-2 text-5xl font-semibold tracking-tight">
                  {usd(effectiveTotalUsd)}
                  <span className="text-lg font-normal text-[var(--muted)]">
                    {" "}/ {period}
                  </span>
                </p>

                <div className="my-6 h-px bg-[var(--border)]" />

                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--muted)]">Subscription</span>
                  <span className="font-medium">{usd(merchantUsd)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-[var(--muted)]">
                    Service fee
                    {isHolder && (
                      <span className="ml-2 rounded-full bg-[var(--primary)] px-2 py-0.5 text-[10px] font-semibold text-white">
                        $SORIO 0.5%
                      </span>
                    )}
                  </span>
                  <span className="font-medium">
                    {isHolder && standardFeeUsd > 0 ? (
                      <>
                        <span className="mr-1.5 text-[var(--muted)] line-through">{usd(standardFeeUsd)}</span>
                        {usd(effectiveFeeUsd)}
                      </>
                    ) : (
                      usd(effectiveFeeUsd)
                    )}
                  </span>
                </div>
                <div className="my-3 h-px bg-[var(--border)]" />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--muted)]">Total per {period}</span>
                  <span className="font-semibold">{usd(effectiveTotalUsd)}</span>
                </div>

                {isHolder ? (
                  <p className="mt-3 text-xs text-[var(--accent)]">
                    You hold $SORIO - discounted 0.5% fee applied.
                  </p>
                ) : address && standardFeeUsd > holderFeeUsd ? (
                  <p className="mt-3 text-xs text-[var(--muted)]">
                    Hold $SORIO and pay 0.5% instead of 2% -
                    you&apos;d save {usd(standardFeeUsd - holderFeeUsd)} each {period} on this plan.
                  </p>
                ) : null}

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
                      setDone(true);
                      if (redirectUri) {
                        setRedirecting(true);
                        const dest = new URL(redirectUri);
                        dest.searchParams.set("subscription", r.subscriptionPda.toString());
                        dest.searchParams.set("plan", plan.plan_pda);
                        dest.searchParams.set("status", "active");
                        setTimeout(() => { window.location.href = dest.toString(); }, 2000);
                      }
                    } catch (e: any) {
                      console.error("subscribe failed:", e);
                      if (e?.message === "USER_CANCELLED") return;
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
                          {usd(effectiveTotalUsd)} × {parseInt(times)} ={" "}
                          {usd(effectiveTotalUsd * parseInt(times))} total, then auto-stops.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {redirectHost && !done && (
                  <p className="mt-4 text-center text-xs text-[var(--muted)]">
                    You'll be returned to <span className="font-medium">{redirectHost}</span> after subscribing.
                  </p>
                )}
                {isOwnPlan && (
                  <p className="mt-3 text-center text-sm text-[var(--muted)]">
                    You can&apos;t subscribe to your own plan.
                  </p>
                )}
                {done && (
                  <p className="mt-3 text-center text-sm text-[var(--accent)]">
                    {redirecting
                      ? `Redirecting back to ${redirectHost}…`
                      : "You're all set. Payments will renew automatically."}
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