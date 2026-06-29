"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { AppShell } from "../app-shell";
import { useWallet } from "../providers";
import { signRequest } from "../lib/sign-request";
import { fetcher } from "../lib/fetcher";

type Stats = {
  code: string;
  stats: {
    invitedTotal: number;
    confirmedCount: number;
    pendingCount: number;
    accruedBaseUnits: number;
    paidBaseUnits: number;
  };
  isHolder: boolean;
  payoutThresholdUsd: number;
  hasPendingPayout: boolean;
};

const usd = (baseUnits: number) =>
  `$${(baseUnits / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 4 })}`;

export default function BonusPage() {
  const { address } = useWallet();
  const { mutate } = useSWRConfig();
  const swrKey = address ? `/api/referral-stats?wallet=${address}` : null;
  const { data, error: swrError, isLoading: loading } = useSWR<Stats>(swrKey, fetcher);
  const err = swrError ? (swrError.message ?? "failed") : null;
  const [copied, setCopied] = useState(false);
  const [requesting, setRequesting] = useState(false);

  async function requestPayout() {
    setRequesting(true);
    try {
      const auth = await signRequest("referral-payout-request", {});
      const r = await fetch("/api/referral-payout/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(auth),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "failed");
      await mutate(swrKey);
    } catch (e: any) {
      if (e?.message !== "USER_CANCELLED") alert(e?.message ?? "Payout request failed");
    } finally {
      setRequesting(false);
    }
  }

  const link = data
    ? `${typeof window !== "undefined" ? window.location.origin : "https://soriopay.com"}/?invite=${data.code}`
    : "";

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked - user can select manually */
    }
  };

  const accrued = data?.stats.accruedBaseUnits ?? 0;
  const threshold = (data?.payoutThresholdUsd ?? 1) * 1_000_000;
  const reachedMin = accrued >= threshold;

  return (
    <AppShell>
      <h1 className="text-3xl font-semibold tracking-tight">Bonus</h1>
      <p className="mt-2 text-[var(--muted)] leading-relaxed">
        Invite people to Sorio and earn 0.4% of every payment they make.
      </p>

      {!address && (
        <p className="mt-8 text-[var(--muted)]">Connect your wallet to get your referral link.</p>
      )}

      {address && loading && <p className="mt-8 text-[var(--muted)]">Loading…</p>}
      {err && <p className="mt-8 text-sm text-red-500">Error: {err}</p>}

      {data && (
        <div className="mt-8 space-y-8">
          {/* Referral link */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-6 md:p-6">
            <p className="text-sm font-medium text-[var(--muted)]">Your referral link</p>
            <div className="w-[100%] mt-3 flex items-center gap-2">
              <input
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                className="w-[80%] flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm outline-none"
              />
              <button
                onClick={copy}
                aria-label={copied ? "Copied" : "Copy link"}
                title={copied ? "Copied" : "Copy link"}
                className="flex items-center justify-center rounded-lg border border-[var(--border)] px-3 py-2.5 text-[var(--muted)] transition hover:border-[var(--primary)] hover:text-[var(--foreground)]"
              >
                {copied ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <Card label="People invited" value={data.stats.confirmedCount} sub={data.stats.pendingCount > 0 ? `${data.stats.pendingCount} pending` : undefined} />
            <Card label="Earned (unpaid)" value={usd(data.stats.accruedBaseUnits)} />
            <Card label="Paid out" value={usd(data.stats.paidBaseUnits)} />
          </div>

          {/* Holder / payout status */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
            <p className="text-sm font-medium">Payout status</p>
            <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
              <li className="flex items-center gap-2">
                <Dot ok={reachedMin} />
                {reachedMin
                  ? `You've reached the $${data.payoutThresholdUsd} minimum.`
                  : `Earn ${usd(threshold - accrued)} more to reach the $${data.payoutThresholdUsd} payout minimum.`}
              </li>
              <li className="flex items-center gap-2">
                <Dot ok={data.isHolder} />
                {data.isHolder
                  ? "You hold 20,000+ $SORIO - eligible for payout."
                  : "Hold 20,000 $SORIO to be eligible for payout."}
              </li>
            </ul>
            {reachedMin && data.isHolder && (
              <div className="mt-4">
                {data.hasPendingPayout ? (
                  <p className="text-sm text-[var(--accent)]">
                    Payout requested. You&apos;ll be paid from the bonus wallet shortly.
                  </p>
                ) : (
                  <button
                    onClick={requestPayout}
                    disabled={requesting}
                    className="rounded-lg bg-[var(--btn)] px-4 py-2.5 text-sm font-medium text-[var(--btn-text)] transition hover:bg-[var(--btn-hover)] disabled:opacity-40"
                  >
                    {requesting ? "Requesting…" : "Request payout"}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* How it works */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
            <p className="text-sm font-medium">How it works</p>
            <ol className="mt-3 space-y-2 text-sm text-[var(--muted)] list-decimal list-inside">
              <li>Share your link. Anyone who joins through it becomes your referral.</li>
              <li>When they pay through Sorio (subscriptions or payroll), you earn 0.4% of each payment.</li>
              <li>Earnings accrue continuously, as long as they keep using Sorio.</li>
              <li>Once you&apos;ve earned ${data.payoutThresholdUsd}+ and hold 20,000 $SORIO, you&apos;re paid from the bonus wallet.</li>
            </ol>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Card({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-[var(--muted)]">{sub}</p>}
    </div>
  );
}

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      className="inline-block h-2 w-2 flex-none rounded-full"
      style={{ background: ok ? "var(--accent)" : "var(--muted)" }}
    />
  );
}